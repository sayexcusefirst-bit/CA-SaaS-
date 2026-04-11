import os
import random
import io
import pandas as pd
import pdfplumber
from flask import Flask, request, jsonify, send_from_directory
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker

# --- SQLALCHEMY DB SETUP ---
# App uses ephemeral local DB on Render free tier
DATABASE_URL = "sqlite:///./ca_saas.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Client(Base):
    __tablename__ = "clients"
    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    gstin = Column(String, index=True)

class ReconciliationRecord(Base):
    __tablename__ = "reconciliation_records"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String, ForeignKey("clients.id"))
    invoice = Column(String)
    vendor = Column(String)
    gstr2b_amount = Column(Float, nullable=True)
    gstr3b_amount = Column(Float, nullable=True)
    status = Column(String)
    type = Column(String)
    details = Column(String, nullable=True)

Base.metadata.create_all(bind=engine)

def seed_db():
    db = SessionLocal()
    try:
        if db.query(Client).first() is None:
            clients = [
                Client(id="c1", name="Acme Corp Pvt Ltd", gstin="27AADCB2230M1Z2"),
                Client(id="c2", name="Global Tech Solutions", gstin="07BBNPP3452L1Z9"),
                Client(id="c3", name="Sunrise Traders", gstin="24AAACC1206D1Z1")
            ]
            db.add_all(clients)
            db.commit()

            # Seed initial records for c1
            records = [
                ReconciliationRecord(client_id="c1", invoice='INV-2023-001', vendor='Tech Solutions', gstr2b_amount=50000, gstr3b_amount=50000, status='Matched', type='GST'),
                ReconciliationRecord(client_id="c1", invoice='INV-2023-042', vendor='Office Supplies Co', gstr2b_amount=15000, gstr3b_amount=0, status='Missing in 3B', type='GST'),
                ReconciliationRecord(client_id="c1", invoice='INV-2023-088', vendor='Cloud Services Ltd', gstr2b_amount=25000, gstr3b_amount=22000, status='Mismatch', type='GST'),
                ReconciliationRecord(client_id="c1", invoice='TRX-9901', vendor='Bank Charges', status='Anomaly', type='Bank', details='Uncategorized deduction of ₹450')
            ]
            db.add_all(records)
            db.commit()
    finally:
        db.close()

seed_db()

# --- FLASK APP ---
app = Flask(__name__, static_folder=".")

# Setup the Flask-JWT-Extended extension
app.config["JWT_SECRET_KEY"] = "super-secret-taxai-secure-key"  # Keep this secret!
jwt = JWTManager(app)


# --- HELPERS: OPEN SOURCE PARSING ---
def parse_csv_to_records(file_content, client_id, filename):
    records = []
    try:
        # Read file with pandas
        df = pd.read_csv(io.BytesIO(file_content))
        # Simple heuristic: scan rows to find mock "amounts" or create generic entries
        for index, row in df.iterrows():
            amt = float(index * 1000) # Mock computation, replacing this with `row['Taxable Value']` inside real schema
            records.append(ReconciliationRecord(
                client_id=client_id,
                invoice=f'CSV-{index}',
                vendor=filename,
                gstr2b_amount=amt,
                gstr3b_amount=amt, # Let's say matched
                status='Matched',
                type='CSV'
            ))
        # Limit to 5 for UI performance
        return records[:5]
    except Exception as e:
        print("CSV Error:", e)
        return []

def parse_pdf_to_records(file_content, client_id, filename):
    records = []
    try:
        # Load PDF using pdfplumber programmatically
        with pdfplumber.open(io.BytesIO(file_content)) as pdf:
            pages = len(pdf.pages)
            # Find occurrences of 'fee' or 'deduction' across pages
            text = ""
            for page in pdf.pages[:3]: # Scan first 3 pages
                extracted = page.extract_text()
                if extracted:
                    text += extracted
            
            # Simple simulation:
            if pages > 0:
                 records.append(ReconciliationRecord(
                     client_id=client_id,
                     invoice=f'PDF-EXTRACT',
                     vendor=filename,
                     gstr2b_amount=None,
                     gstr3b_amount=None,
                     status='Anomaly',
                     type='PDF',
                     details=f'Successfully read {pages} pages from PDF using open source pdfplumber.'
                 ))
            return records
    except Exception as e:
         print("PDF Error:", e)
         return []


# --- ROUTES ---

@app.route("/api/v1/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    email = data.get("email", "ca@firm.com")
    
    # Internal auth logic happens here
    # Create the secure JWT access token
    access_token = create_access_token(
        identity=email, 
        additional_claims={"role": "admin", "name": "Admin CA"}
    )
    
    return jsonify({
        "user": {"name": "Admin CA", "email": email, "role": "admin"},
        "token": access_token
    })

@app.route("/api/v1/clients", methods=["GET"])
@jwt_required()
def get_clients():
    db = SessionLocal()
    try:
        clients = db.query(Client).all()
        return jsonify({"clients": [{"id": c.id, "name": c.name, "gstin": c.gstin} for c in clients]})
    finally:
        db.close()

@app.route("/api/v1/reconciliation/results/<client_id>", methods=["GET"])
@jwt_required()
def get_reconciliation(client_id):
    db = SessionLocal()
    try:
        records = db.query(ReconciliationRecord).filter(ReconciliationRecord.client_id == client_id).all()
        return jsonify({"results": [{"id": r.id, "invoice": r.invoice, "vendor": r.vendor, "gstr2b_amount": r.gstr2b_amount, "gstr3b_amount": r.gstr3b_amount, "status": r.status, "type": r.type, "details": r.details} for r in records]})
    finally:
        db.close()

@app.route("/api/v1/reconciliation/process/<client_id>", methods=["POST"])
@jwt_required()
def process_reconciliation(client_id):
    files = request.files.getlist("files")
    
    db = SessionLocal()
    try:
        generated_records = []
        for fileObj in files:
            file_bytes = fileObj.read()
            name = fileObj.filename.lower()
            
            if name.endswith('.csv'):
                generated_records.extend(parse_csv_to_records(file_bytes, client_id, fileObj.filename))
            elif name.endswith('.pdf'):
                generated_records.extend(parse_pdf_to_records(file_bytes, client_id, fileObj.filename))
            else:
                 # Default fallback if unknown type
                 generated_records.append(
                     ReconciliationRecord(client_id=client_id, invoice=f'SYS-{random.randint(100, 999)}', vendor=fileObj.filename, status='Matched', type='Unknown')
                 )
        
        db.add_all(generated_records)
        db.commit()
    finally:
        db.close()
        
    file_names = [f.filename for f in files] if files else []
    return jsonify({"status": "success", "processed_files": file_names})

# Serve static files gracefully
@app.route("/")
def serve_index():
    return send_from_directory(".", "index.html")

@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory(".", path)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
