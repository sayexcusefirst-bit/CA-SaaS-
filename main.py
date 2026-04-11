import os
import random
import io
import pandas as pd
import pdfplumber
from flask import Flask, request, jsonify, send_from_directory
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker
from werkzeug.security import generate_password_hash, check_password_hash
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# --- SQLALCHEMY DB SETUP ---
# Supports switching to a permanent managed Postgres database (like Supabase/Neon)
raw_db_url = os.environ.get("DATABASE_URL", "sqlite:///./ca_saas.db")
# SQLAlchemy 1.4+ requires 'postgresql://' instead of 'postgres://'
if raw_db_url.startswith("postgres://"):
    raw_db_url = raw_db_url.replace("postgres://", "postgresql://", 1)
DATABASE_URL = raw_db_url

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)
    
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String, nullable=True) # Null for google-only users
    name = Column(String)
    auth_provider = Column(String, default="local") # 'local' or 'google'

class Client(Base):
    __tablename__ = "clients"
    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
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

# Auto-migrate: Add user_id to clients if it doesn't exist from the old version
from sqlalchemy import text
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE clients ADD COLUMN user_id INTEGER REFERENCES users(id)"))
        conn.commit()
except Exception:
    pass # Column already exists or table structure is fine
    
# Auto-migrate: Add auth_provider to users if it doesn't exist
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN auth_provider VARCHAR DEFAULT 'local'"))
        conn.commit()
except Exception:
    pass
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

@app.route("/api/v1/auth/signup", methods=["POST"])
def signup():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")
    name = data.get("name", "CA Admin")
    
    if not email or not password:
        return jsonify({"msg": "Missing email or password"}), 400
        
    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == email).first():
            return jsonify({"msg": "Email already exists"}), 400
            
        new_user = User(
            email=email,
            password_hash=generate_password_hash(password),
            name=name,
            auth_provider="local"
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        access_token = create_access_token(identity=str(new_user.id), additional_claims={"name": new_user.name, "email": new_user.email})
        return jsonify({
            "user": {"id": new_user.id, "name": new_user.name, "email": new_user.email},
            "token": access_token
        })
    finally:
        db.close()

@app.route("/api/v1/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")
    
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user or not user.password_hash or not check_password_hash(user.password_hash, password):
            return jsonify({"msg": "Invalid credentials"}), 401
            
        access_token = create_access_token(identity=str(user.id), additional_claims={"name": user.name, "email": user.email})
        return jsonify({
            "user": {"id": user.id, "name": user.name, "email": user.email},
            "token": access_token
        })
    finally:
        db.close()

@app.route("/api/v1/auth/google", methods=["POST"])
def google_auth():
    data = request.get_json()
    credential = data.get("credential")
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    
    if not credential:
        return jsonify({"msg": "Missing Google credential"}), 400
        
    try:
        # If client_id is completely missing in Render, fallback to bypass verification for local testing
        idinfo = id_token.verify_oauth2_token(credential, google_requests.Request(), client_id if client_id else None)
        
        email = idinfo['email']
        name = idinfo.get('name', 'Google User')
        
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == email).first()
            if not user:
                user = User(email=email, name=name, auth_provider="google")
                db.add(user)
                db.commit()
                db.refresh(user)
                
            access_token = create_access_token(identity=str(user.id), additional_claims={"name": user.name, "email": user.email})
            return jsonify({
                "user": {"id": user.id, "name": user.name, "email": user.email},
                "token": access_token
            })
        finally:
            db.close()
    except ValueError as e:
        return jsonify({"msg": "Invalid Google token"}), 401
        
@app.route("/api/v1/user/profile", methods=["PUT"])
@jwt_required()
def update_profile():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"msg": "User not found"}), 404
            
        if "name" in data:
            user.name = data["name"]
        if "password" in data and data["password"]:
            user.password_hash = generate_password_hash(data["password"])
            user.auth_provider = "local" # If they add a password to Google account, they can now login locally
            
        db.commit()
        
        # Issue a fresh token with updated claims
        access_token = create_access_token(identity=str(user.id), additional_claims={"name": user.name, "email": user.email})
        return jsonify({
            "user": {"id": user.id, "name": user.name, "email": user.email},
            "token": access_token
        })
    finally:
        db.close()

@app.route("/api/v1/config", methods=["GET"])
def get_config():
    return jsonify({"google_client_id": os.environ.get("GOOGLE_CLIENT_ID", "")})

@app.route("/api/v1/clients", methods=["GET"])
@jwt_required()
def get_clients():
    user_id = int(get_jwt_identity())
    db = SessionLocal()
    try:
        clients = db.query(Client).filter(Client.user_id == user_id).all()
        return jsonify({"clients": [{"id": c.id, "name": c.name, "gstin": c.gstin} for c in clients]})
    finally:
        db.close()

@app.route("/api/v1/clients", methods=["POST"])
@jwt_required()
def create_client():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    db = SessionLocal()
    try:
        client_id = f"c{random.randint(1000, 9999)}"
        new_client = Client(id=client_id, user_id=user_id, name=data.get("name"), gstin=data.get("gstin"))
        db.add(new_client)
        db.commit()
        return jsonify({"status": "success", "client": {"id": new_client.id, "name": new_client.name, "gstin": new_client.gstin}})
    finally:
        db.close()

@app.route("/api/v1/reconciliation/results/<client_id>", methods=["GET"])
@jwt_required()
def get_reconciliation(client_id):
    user_id = int(get_jwt_identity())
    db = SessionLocal()
    try:
        # Validate ownership
        client = db.query(Client).filter(Client.id == client_id, Client.user_id == user_id).first()
        if not client:
            return jsonify({"msg": "Unauthorized"}), 401
            
        records = db.query(ReconciliationRecord).filter(ReconciliationRecord.client_id == client_id).all()
        return jsonify({"results": [{"id": r.id, "invoice": r.invoice, "vendor": r.vendor, "gstr2b_amount": r.gstr2b_amount, "gstr3b_amount": r.gstr3b_amount, "status": r.status, "type": r.type, "details": r.details} for r in records]})
    finally:
        db.close()

@app.route("/api/v1/reconciliation/process/<client_id>", methods=["POST"])
@jwt_required()
def process_reconciliation(client_id):
    user_id = int(get_jwt_identity())
    files = request.files.getlist("files")
    
    db = SessionLocal()
    try:
        client = db.query(Client).filter(Client.id == client_id, Client.user_id == user_id).first()
        if not client:
            return jsonify({"msg": "Unauthorized"}), 401
            
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
