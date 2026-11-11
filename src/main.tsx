import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { initPwa } from './lib/pwa';
import { hideSplash } from './lib/splash';

initPwa();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

// tutup layar pembuka setelah tampilan pertama aplikasi tergambar
requestAnimationFrame(() => requestAnimationFrame(hideSplash));
