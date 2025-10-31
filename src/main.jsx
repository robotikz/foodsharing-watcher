import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { initializeApp } from 'firebase/app'
import { getAnalytics, isSupported as analyticsIsSupported } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: 'AIzaSyAoaWWFRD7PXyVf7vB3qNk0UL5heTuBdVw',
  authDomain: 'foodsharing-watcher.firebaseapp.com',
  projectId: 'foodsharing-watcher',
  storageBucket: 'foodsharing-watcher.firebasestorage.app',
  messagingSenderId: '972861051439',
  appId: '1:972861051439:web:0156a75a86a54be4e66cda',
  measurementId: 'G-KZD14SFL0W',
}

const appFirebase = initializeApp(firebaseConfig)
// Initialize analytics only if supported (avoids SSR or unsupported env issues)
analyticsIsSupported().then((supported) => {
  if (supported) getAnalytics(appFirebase)
}).catch(() => {})

const root = createRoot(document.getElementById('root'))
root.render(<App />)
