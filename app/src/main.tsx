import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Refine } from '@refinedev/core';
import { dataProvider } from './lib/simple-rest';
import App from './App';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Refine
        dataProvider={dataProvider(API_URL)}
        options={{
          syncWithLocation: true,
          warnWhenUnsavedChanges: true,
        }}
      >
        <App />
      </Refine>
    </BrowserRouter>
  </React.StrictMode>
);
