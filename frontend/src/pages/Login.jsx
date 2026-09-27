import { useContext, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ClipboardList, Lock, PieChart, Stethoscope } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';
import StatusBanner from '../components/StatusBanner';

const DEMOS = [
  { username: 'admin', password: '1234', label: 'Administrateur', hint: 'admin' },
  { username: 'user', password: 'test', label: 'Délégué', hint: 'user' },
];

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { user, login } = useContext(AuthContext);
  const navigate = useNavigate();

  if (user) return <Navigate to="/" replace />;

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await login(username.trim(), password);
    setLoading(false);
    if (result.success) navigate('/');
    else setError(result.error);
  };

  return (
    <div className="login-screen">
      <section className="login-brand">
        <div className="sidebar-logo" aria-hidden="true"><Stethoscope size={18} /></div>
        <h1>CRM Pharma</h1>
        <p>Suivez les visites médicales, consultez le référentiel médicament et préparez vos comptes rendus.</p>
        <ul>
          <li><ClipboardList size={16} /> Comptes rendus de visite structurés</li>
          <li><PieChart size={16} /> Indicateurs d’activité par spécialité</li>
          <li><Stethoscope size={16} /> Assistant pour les produits et les rendez-vous</li>
        </ul>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleLogin}>
          <h2>Connexion</h2>
          <p className="lede">Accédez à l’espace délégué.</p>
          <StatusBanner>{error}</StatusBanner>
          <div className="demo-row" style={{ marginTop: error ? 14 : 0 }}>
            {DEMOS.map((demo) => (
              <button
                key={demo.username}
                type="button"
                className={`demo-chip${username === demo.username ? ' active' : ''}`}
                onClick={() => { setUsername(demo.username); setPassword(demo.password); setError(null); }}
              >
                {demo.label}
                <small>{demo.hint}</small>
              </button>
            ))}
          </div>
          <div className="form-group">
            <label htmlFor="username">Identifiant</label>
            <input id="username" type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="password">Mot de passe</label>
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          <button type="submit" className="primary-btn" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Connexion…' : <><Lock size={16} /> Se connecter</>}
          </button>
          <p className="field-hint">Les comptes de démonstration remplissent le formulaire.</p>
        </form>
      </section>
    </div>
  );
};

export default Login;
