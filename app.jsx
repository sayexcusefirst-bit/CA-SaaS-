const { useState, useEffect, createContext, useContext } = React;

// --- Mock Data & AI Logic ---
const CLIENTS = [
  { id: 'c1', name: 'Acme Corp Pvt Ltd', gstin: '27AADCB2230M1Z2' },
  { id: 'c2', name: 'Global Tech Solutions', gstin: '07BBNPP3452L1Z9' },
  { id: 'c3', name: 'Sunrise Traders', gstin: '24AAACC1206D1Z1' },
];

const generateMockReconciliation = (client) => {
  return [
    { id: 1, invoice: 'INV-2023-001', vendor: 'Tech Solutions', gstr2b_amount: 50000, gstr3b_amount: 50000, status: 'Matched', type: 'GST' },
    { id: 2, invoice: 'INV-2023-042', vendor: 'Office Supplies Co', gstr2b_amount: 15000, gstr3b_amount: 0, status: 'Missing in 3B', type: 'GST' },
    { id: 3, invoice: 'INV-2023-088', vendor: 'Cloud Services Ltd', gstr2b_amount: 25000, gstr3b_amount: 22000, status: 'Mismatch', type: 'GST' },
    { id: 4, invoice: 'TRX-9901', vendor: 'Bank Charges', gstr2b_amount: null, gstr3b_amount: null, status: 'Anomaly', type: 'Bank', details: 'Uncategorized deduction of ₹450' }
  ];
};

// --- Contexts ---
const AuthContext = createContext();
const ClientContext = createContext();

// --- Icons (Inlined for reliability without bundler) ---
const Icons = {
  PieChart: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>,
  Upload: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>,
  FileText: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>,
  CheckCircle: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
  AlertTriangle: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
  Download: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>,
  Users: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
  Settings: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
  LogOut: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>,
  Shield: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>,
  Loader: () => <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="processing-spinner"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
};

// --- Components ---

function LoginScreen() {
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    login({ name: 'Admin CA', email });
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card animate-fade-in">
        <div className="auth-header">
          <h1><Icons.Shield /> TaxAI</h1>
          <p style={{ color: 'var(--text-muted)' }}>Premium SaaS for Indian Chartered Accountants</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" 
              className="form-input" 
              placeholder="ca@firm.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }}>
            Sign In to Workspace
          </button>
        </form>
      </div>
    </div>
  );
}

function Sidebar({ currentView, setCurrentView }) {
  const { logout } = useContext(AuthContext);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard Overview', icon: Icons.PieChart },
    { id: 'upload', label: 'Document Upload Hub', icon: Icons.Upload },
    { id: 'recon', label: 'AI Reconciliation (GSTR)', icon: Icons.FileText },
    { id: 'clients', label: 'Client Directory', icon: Icons.Users },
    { id: 'settings', label: 'Firm Settings', icon: Icons.Settings },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <Icons.Shield /> TaxAI Hub
      </div>
      <div className="sidebar-nav">
        {menuItems.map(item => {
          const Icon = item.icon;
          return (
             <div 
               key={item.id} 
               className={`nav-item ${currentView === item.id ? 'active' : ''}`}
               onClick={() => setCurrentView(item.id)}
             >
               <Icon /> {item.label}
             </div>
          )
        })}
      </div>
      <div className="sidebar-nav" style={{ flex: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="nav-item" onClick={logout} style={{ color: '#FCA5A5' }}>
          <Icons.LogOut /> Sign Out
        </div>
      </div>
    </div>
  );
}

function Topbar() {
  const { activeClient, setActiveClient } = useContext(ClientContext);
  const { user } = useContext(AuthContext);

  return (
    <div className="topbar">
      <div className="client-selector-container">
        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)' }}>Context:</span>
        <select 
          className="client-select" 
          value={activeClient.id}
          onChange={(e) => setActiveClient(CLIENTS.find(c => c.id === e.target.value))}
        >
          {CLIENTS.map(client => (
            <option key={client.id} value={client.id}>
              {client.name} ({client.gstin})
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{user.name}</span>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
          CA
        </div>
      </div>
    </div>
  );
}

function UploadHub({ onUploadComplete }) {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDrag = function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = function(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = function(e) {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = (newFiles) => {
    const fileArray = Array.from(newFiles).map(f => ({ name: f.name, size: (f.size / 1024 / 1024).toFixed(2) + ' MB' }));
    setFiles([...files, ...fileArray]);
  };

  const startAIProcessing = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      onUploadComplete();
    }, 3000); // Mock 3s processing
  };

  if (isProcessing) {
    return (
      <div className="card animate-fade-in processing-view">
         <Icons.Loader />
         <h2>AI Engine is parsing your documents...</h2>
         <p style={{ color: 'var(--text-muted)' }}>Extracting GSTR-2B, GSTR-3B data and reconciling with bank statements.</p>
      </div>
    );
  }

  return (
    <div className="card animate-fade-in">
      <div className="card-header">
        <div className="card-title"><Icons.Upload /> Upload Documents for Reconciliation</div>
      </div>
      <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Upload GSTR-2B JSON/Excel, GSTR-3B returns, or Bank Statements (CSV/PDF) here. Our semantic AI will map the fields automatically.
      </p>

      <div 
        className={`upload-zone ${dragActive ? 'active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="upload-icon"><Icons.FileText /></div>
        <div className="upload-text">Drag and drop files here to upload</div>
        <div className="upload-subtext">Supported formats: .csv, .xlsx, .json, .pdf (Bank Statements)</div>
        <input 
             type="file" 
             multiple 
             className="upload-input" 
             onChange={handleChange} 
             accept=".csv,.xlsx,.json,.pdf" 
         />
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h4>Staged Files</h4>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.5rem', marginBottom: '1.5rem' }}>
            {files.map((file, i) => (
              <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', marginBottom: '0.5rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Icons.FileText /> {file.name}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{file.size}</span>
              </li>
            ))}
          </ul>
          <button className="btn btn-primary" onClick={startAIProcessing}>
            <Icons.CheckCircle /> Process & Run AI Reconciliation
          </button>
        </div>
      )}
    </div>
  );
}

function ReconDashboard() {
  const { activeClient } = useContext(ClientContext);
  const [data, setData] = useState([]);

  useEffect(() => {
    // Mock loading data when client changes
    setData(generateMockReconciliation(activeClient));
  }, [activeClient]);

  const getBadgeClass = (status) => {
    if (status === 'Matched') return 'badge-success';
    if (status === 'Mismatch' || status === 'Missing in 3B') return 'badge-danger';
    return 'badge-warning';
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");
    XLSX.writeFile(wb, `${activeClient.name.replace(/ /g, '_')}_GSTR_Reconciliation.xlsx`);
  };

  return (
    <div className="animate-fade-in">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon primary"><Icons.FileText /></div>
          <div className="stat-details">
            <h3>Total Invoices Processed</h3>
            <p>1,245</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon danger"><Icons.AlertTriangle /></div>
          <div className="stat-details">
            <h3>GSTR Mismatches</h3>
            <p>14</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning"><Icons.Shield /></div>
          <div className="stat-details">
            <h3>Bank Anomalies</h3>
            <p>3</p>
          </div>
        </div>
      </div>

      <div className="card">
         <div className="card-header">
           <div className="card-title"><Icons.CheckCircle /> AI Reconciliation Results ({activeClient.name})</div>
           <button className="btn btn-secondary" onClick={exportToExcel}>
             <Icons.Download /> Export to Excel
           </button>
         </div>
         
         <div className="table-container">
           <table className="data-table">
             <thead>
               <tr>
                 <th>Type</th>
                 <th>Invoice / Ref</th>
                 <th>Vendor / Details</th>
                 <th>GSTR-2B Amt</th>
                 <th>GSTR-3B Amt</th>
                 <th>Status</th>
               </tr>
             </thead>
             <tbody>
               {data.map(row => (
                 <tr key={row.id}>
                   <td><strong>{row.type}</strong></td>
                   <td>{row.invoice}</td>
                   <td>{row.vendor || row.details}</td>
                   <td>{row.gstr2b_amount ? `₹${row.gstr2b_amount.toLocaleString()}` : '-'}</td>
                   <td>{row.gstr3b_amount !== null ? `₹${row.gstr3b_amount.toLocaleString()}` : '-'}</td>
                   <td>
                     <span className={`badge ${getBadgeClass(row.status)}`}>{row.status}</span>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
      </div>
    </div>
  );
}

function MainLayout() {
  const [currentView, setCurrentView] = useState('dashboard');

  return (
    <div className="app-container">
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />
      <div className="main-content">
        <Topbar />
        <div className="content-area">
          {currentView === 'dashboard' && (
            <div className="animate-fade-in">
              <h1>Welcome back, CA Admin!</h1>
              <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Here's the overview for your active client context.</p>
              <ReconDashboard />
            </div>
          )}
          {currentView === 'upload' && (
            <UploadHub onUploadComplete={() => setCurrentView('recon')} />
          )}
          {currentView === 'recon' && (
            <ReconDashboard />
          )}
          {(currentView === 'clients' || currentView === 'settings') && (
            <div className="card animate-fade-in">
              <div className="card-header">
                <div className="card-title">Module Under Construction</div>
              </div>
              <p>This section is part of the extended SaaS functionality.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [activeClient, setActiveClient] = useState(CLIENTS[0]);

  useEffect(() => {
    // Check local storage for mock session
    const mockSession = localStorage.getItem('ca_session');
    if (mockSession) setUser(JSON.parse(mockSession));
  }, []);

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('ca_session', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('ca_session');
  };

  if (!user) {
    return (
      <AuthContext.Provider value={{ login }}>
        <LoginScreen />
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={{ user, logout }}>
      <ClientContext.Provider value={{ activeClient, setActiveClient }}>
        <MainLayout />
      </ClientContext.Provider>
    </AuthContext.Provider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
