import { Menu } from 'lucide-react';

const PageHeader = ({ isSidebarOpen, setIsSidebarOpen, title, subtitle, children }) => {
  return (
    <header className="chat-header">
      <button
        type="button"
        className="toggle-sidebar-btn"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-label={isSidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-expanded={isSidebarOpen}
      >
        <Menu size={20} />
      </button>
      <div className="header-info">
        <h1 className="header-title">{title}</h1>
        {subtitle ? <p className="header-status">{subtitle}</p> : null}
      </div>
      {children}
    </header>
  );
};

export default PageHeader;
