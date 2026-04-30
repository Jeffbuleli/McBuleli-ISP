import React, { useState } from 'react';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './modules/Dashboard/Dashboard';
import './App.css';

function App() {
  const [currentModule, setCurrentModule] = useState('dashboard');

  const renderModule = () => {
    switch (currentModule) {
      case 'dashboard':
        return <Dashboard />;
      case 'settings':
        return <div style={{ padding: '20px' }}><h1>Settings Module</h1></div>;
      case 'team-chat':
        return <div style={{ padding: '20px' }}><h1>Team Chat Module</h1></div>;
      default:
        return <Dashboard />;
    }
  };

  return (
    <MainLayout onMenuSelect={setCurrentModule}>
      {renderModule()}
    </MainLayout>
  );
}

export default App;
