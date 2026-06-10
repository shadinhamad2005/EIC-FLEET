import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    initializeFirestore, 
    memoryLocalCache, 
    collection, 
    doc,
    updateDoc,
    addDoc,
    setDoc,
    deleteDoc,
    query,
    where,
    getDocs,
    arrayUnion,
    runTransaction,
    limit,
    serverTimestamp,
    onSnapshot,
    orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCSVE4DJIKMx4OkBi_TJct2E9HB_GYpbhM",
    authDomain: "eic-fleet.firebaseapp.com",
    projectId: "eic-fleet",
    storageBucket: "eic-fleet.firebasestorage.app",
    messagingSenderId: "375768338401",
    appId: "1:375768338401:web:62c355a298ec80ad240ca0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: memoryLocalCache() });

const APP_ID = "eic-fleet";
const getCol = (name) => collection(db, 'artifacts', APP_ID, 'public', 'data', name);
const getDocRef = (colName, docId) => doc(db, 'artifacts', APP_ID, 'public', 'data', colName, docId);

export { 
    app, 
    auth, 
    db, 
    getCol, 
    getDocRef, 
    signInAnonymously,
    collection,
    doc,
    updateDoc,
    addDoc,
    setDoc,
    deleteDoc,
    query,
    where,
    getDocs,
    arrayUnion,
    runTransaction,
    limit,
    serverTimestamp,
    onSnapshot,
    orderBy
};
