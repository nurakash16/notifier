// lib/firebaseAdmin.js
import * as admin from 'firebase-admin';

console.log('Firebase Admin module loaded');

if (!admin.apps.length) {
  console.log('Initializing Firebase Admin...');
  console.log('Project ID:', process.env.FIREBASE_PROJECT_ID ? 'Exists' : 'Missing');
  console.log('Client Email:', process.env.FIREBASE_CLIENT_EMAIL ? 'Exists' : 'Missing');
  console.log('Private Key:', process.env.FIREBASE_PRIVATE_KEY ? 'Exists' : 'Missing');
  
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Firebase Admin initialization failed:', error.message);
    throw error;
  }
} else {
  console.log('Firebase Admin already initialized');
}

export const db = admin.firestore();
export const fcm = admin.messaging();
export default admin;