import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Home from './pages/Home.jsx';
import JoinGame from './pages/JoinGame.jsx';
import TeacherDashboard from './pages/TeacherDashboard.jsx';
import Game1 from './pages/Game1.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join" element={<JoinGame />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/game1" element={<Game1 />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
