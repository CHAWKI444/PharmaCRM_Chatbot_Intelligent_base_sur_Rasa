import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import SubmitReport from './pages/SubmitReport';
import GenerateReport from './pages/GenerateReport';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import { AuthProvider, AuthContext } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const { user } = React.useContext(AuthContext);
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

function readChatHistory() {
  try {
    const savedHistory = localStorage.getItem('chatHistory');
    const parsed = savedHistory ? JSON.parse(savedHistory) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((msg) => ({ ...msg, time: new Date(msg.time) }));
  } catch {
    return [];
  }
}

function App() {
  const [messages, setMessages] = useState(readChatHistory);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 768);

  // Save chat history
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chatHistory', JSON.stringify(messages));
    }
  }, [messages]);

  const clearChat = () => {
    window.speechSynthesis?.cancel();
    setMessages([]);
    localStorage.removeItem('chatHistory');
  };

  // Responsive sidebar handling
  useEffect(() => {
    const handleResize = () => setIsSidebarOpen(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route 
              element={
                <ProtectedRoute>
                  <Layout 
                    isSidebarOpen={isSidebarOpen} 
                    setIsSidebarOpen={setIsSidebarOpen}
                    clearChat={clearChat}
                    messageCount={messages.length}
                  />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Home isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} messages={messages} setMessages={setMessages} />} />
              <Route path="/dashboard" element={<Dashboard isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />} />
              <Route path="/submit" element={<SubmitReport isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />} />
              <Route path="/generate" element={<GenerateReport isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />} />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
