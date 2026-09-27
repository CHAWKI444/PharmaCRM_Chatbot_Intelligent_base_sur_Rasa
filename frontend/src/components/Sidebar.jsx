import { createElement, useContext, useState } from 'react';
import { ClipboardList, FileText, LogOut, MessageSquare, Moon, PieChart, Stethoscope, Sun, Trash2, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { AuthContext } from '../contexts/AuthContext';
import { ThemeContext } from '../contexts/ThemeContext';

const LINKS = [
  { to: '/', end: true, icon: MessageSquare, label: 'Assistant', caption: 'Médicaments et visites' },
  { to: '/submit', icon: ClipboardList, label: 'Nouvelle visite', caption: 'Compte rendu' },
  { to: '/dashboard', icon: PieChart, label: 'Activité', caption: 'Indicateurs' },
  { to: '/generate', icon: FileText, label: 'Export', caption: 'Rapport Markdown' },
];

const Sidebar = ({ isOpen, setIsSidebarOpen, clearChat, messageCount }) => {
  const { user, logout } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const [confirmClear, setConfirmClear] = useState(false);
  const initial = (user?.name || 'D').trim().charAt(0).toUpperCase();

  const closeOnSmallScreen = () => {
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  return (
    <aside className={clsx('sidebar', !isOpen && 'collapsed')} inert={!isOpen ? true : undefined}>
      <div className="sidebar-header">
        <div className="sidebar-logo" aria-hidden="true">
          <Stethoscope size={18} />
        </div>
        <div className="sidebar-brand">
          <div className="sidebar-title">CRM Pharma</div>
          <div className="sidebar-subtitle">Délégués médicaux</div>
        </div>
        <button type="button" className="icon-btn sidebar-close" onClick={() => setIsSidebarOpen(false)} aria-label="Fermer le menu">
          <X size={18} />
        </button>
      </div>

      <nav className="side-nav" aria-label="Navigation principale">
        {LINKS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} onClick={closeOnSmallScreen} className={({ isActive }) => clsx('nav-link', isActive && 'active')}>
            <span className="nav-icon">{createElement(item.icon, { size: 16 })}</span>
            <span className="nav-copy">
              <span className="nav-label">{item.label}</span>
              <span className="nav-caption">{item.caption}</span>
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-row">
          <div className="user-avatar" aria-hidden="true">{initial}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name">{user?.name || 'Délégué'}</div>
            <div className="user-role">{messageCount} message{messageCount > 1 ? 's' : ''}</div>
          </div>
          <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre'}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
        <button
          type="button"
          className="clear-btn"
          onClick={() => {
            if (!confirmClear) {
              setConfirmClear(true);
              return;
            }
            clearChat();
            setConfirmClear(false);
          }}
        >
          <Trash2 size={15} />
          {confirmClear ? 'Confirmer l’effacement' : 'Effacer la conversation'}
        </button>
        <button type="button" className="ghost-btn" onClick={logout}>
          <LogOut size={15} />
          Déconnexion
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
