import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import './index.css';

import Home from './pages/Home.jsx';
import JoinGame from './pages/JoinGame.jsx';
import TeacherDashboard from './pages/TeacherDashboard.jsx';

// Game1 pulls in Phaser, which is large — keep it out of the initial
// bundle so Home/Join/Teacher stay light.
const Game1 = lazy(() => import('./pages/Game1.jsx'));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join" element={<JoinGame />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route
          path="/game1"
          element={
            <Suspense fallback={<p>Loading game...</p>}>
              <Game1 />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
