import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

const Layout = ({ isSidebarOpen, setIsSidebarOpen, clearChat, messageCount }) => {
  return (
    <div className="app-shell">
      <Sidebar isOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} clearChat={clearChat} messageCount={messageCount} />
      {isSidebarOpen ? (
        <button type="button" className="sidebar-backdrop" aria-label="Fermer le menu" onClick={() => setIsSidebarOpen(false)} />
      ) : null}
      <div className="main-area">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
