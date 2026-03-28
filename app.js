import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, updateDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// TODO: REPlACE THIS WITH YOUR ACTUAL FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const jobsCollection = collection(db, "jobs");

// Application Logic and State
const app = {
    currentLanguage: 'en',
    role: null, // 'owner' or 'worker'
    jobs: [], // Will now be synced from Firebase
    workerOnline: true,
    unsubscribeSnapshot: null, // To cancel listener when offline

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.applyTranslations();
        
        // Expose to window immediately since we use type="module" which encapsulates scope
        window.app = this;
    },

    cacheDOM() {
        this.langSwitcher = document.getElementById('language-switcher');
        this.viewLogin = document.getElementById('view-login');
        this.viewOwner = document.getElementById('view-owner');
        this.viewWorker = document.getElementById('view-worker');
        this.logoutBtn = document.getElementById('logout-btn');
        this.postJobModal = document.getElementById('modal-post-job');
        
        this.ownerJobsList = document.getElementById('owner-jobs-list');
        this.workerJobsList = document.getElementById('worker-jobs-list');
        this.workerEmptyState = document.getElementById('worker-empty-state');
    },

    bindEvents() {
        this.langSwitcher.addEventListener('change', (e) => {
            this.currentLanguage = e.target.value;
            this.applyTranslations();
        });
        
        this.logoutBtn.addEventListener('click', () => {
            this.logout();
        });
    },

    // i18n Logic
    t(key) {
        return window.translations[this.currentLanguage][key] || key;
    },

    applyTranslations() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.innerText = this.t(key);
        });
        
        // Render lists to apply translations to dynamic content
        if(this.role === 'owner') this.renderOwnerJobs();
        if(this.role === 'worker') this.renderWorkerJobs();
    },

    // Navigation / Auth Mock
    login(selectedRole) {
        this.role = selectedRole;
        this.viewLogin.classList.add('hidden');
        this.logoutBtn.classList.remove('hidden');

        if (this.role === 'owner') {
            this.viewOwner.classList.remove('hidden');
        } else {
            this.viewWorker.classList.remove('hidden');
            this.workerOnline = document.getElementById('availability-toggle').checked;
        }

        // Connect to Firebase real-time database when logged in
        this.setupFirebaseListener();
    },

    logout() {
        this.role = null;
        this.viewOwner.classList.add('hidden');
        this.viewWorker.classList.add('hidden');
        this.logoutBtn.classList.add('hidden');
        this.viewLogin.classList.remove('hidden');
        this.jobs = []; // clear local jobs
        
        // Disconnect listener to save bandwidth
        if (this.unsubscribeSnapshot) {
            this.unsubscribeSnapshot();
            this.unsubscribeSnapshot = null;
        }
    },

    // 🚀 Firebase Realtime Integration
    setupFirebaseListener() {
        // Query jobs ordered by timestamp descending (newest first)
        const q = query(jobsCollection, orderBy("timestampMs", "desc"));
        
        this.unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
            const fetchedJobs = [];
            snapshot.forEach((doc) => {
                fetchedJobs.push({ id: doc.id, ...doc.data() });
            });
            
            this.jobs = fetchedJobs;
            
            // Re-render UIs with updated cloud data
            if(this.role === 'owner') this.renderOwnerJobs();
            if(this.role === 'worker') this.renderWorkerJobs();
        }, (error) => {
            console.error("Firebase Error! Are your API keys set and rules open?", error);
            // Optionally show error state in UI
        });
    },

    // Owner Functions
    showPostJobModal() {
        this.postJobModal.classList.remove('hidden');
    },

    hideModals() {
        this.postJobModal.classList.add('hidden');
    },

    async submitJob() {
        const typeSelect = document.getElementById('job-type');
        const wageInput = document.getElementById('job-wage');
        const urgencySelect = document.getElementById('job-urgency');

        const newJob = {
            typeKey: 'type_' + typeSelect.value, // translation key
            wage: Number(wageInput.value),
            urgencyKey: 'urgency_' + urgencySelect.value, // translation key
            status: 'pending',
            timestampStr: new Date().toLocaleTimeString(),
            timestampMs: Date.now() // for precise sorting
        };

        // Instantly close modal while request is sent
        this.hideModals();

        try {
            // Write to Firebase Firestore cloud!
            await addDoc(jobsCollection, newJob);
            // You don't need to update local arrays because onSnapshot pulls it automatically!
        } catch (e) {
            console.error("Error adding document: ", e);
            alert("Error posting job. Have you setup the Firebase DB?");
        }
    },

    renderOwnerJobs() {
        this.ownerJobsList.innerHTML = '';
        
        if (this.jobs.length === 0) {
            this.ownerJobsList.innerHTML = `<div class="empty-state"><p>No jobs posted yet.</p></div>`;
            return;
        }

        this.jobs.forEach(job => {
            const el = document.createElement('div');
            el.className = 'job-card';
            
            let statusBadge = `<span class="badge pending">${this.t('status_pending')}</span>`;
            if (job.status === 'accepted') {
                statusBadge = `<span class="badge accepted">${this.t('status_accepted')} ✓</span>`;
            }

            el.innerHTML = `
                <div class="job-info">
                    <div class="job-title">${this.t(job.typeKey)}</div>
                    <div class="job-meta">
                        <span>🕒 ${this.t(job.urgencyKey)}</span>
                        <span>•</span>
                        <span>⏱️ ${job.timestampStr}</span>
                    </div>
                    <div style="margin-top: 0.5rem">
                        ${statusBadge}
                    </div>
                </div>
                <div class="job-actions">
                    <div class="wage-badge">${this.t('rupees')} ${job.wage}</div>
                </div>
            `;
            this.ownerJobsList.appendChild(el);
        });
    },

    // Worker Functions
    toggleWorkerStatus(isOnline) {
        this.workerOnline = isOnline;
        const textEl = document.getElementById('availability-text');
        
        if (isOnline) {
            textEl.innerText = this.t('status_online');
            textEl.className = 'status-active';
            this.renderWorkerJobs();
        } else {
            textEl.innerText = this.t('status_offline');
            textEl.className = 'status-inactive';
            this.workerJobsList.innerHTML = '';
            this.workerEmptyState.style.display = 'none'; // hide spinner when offline
        }
    },

    async acceptJob(jobId) {
        try {
            // Update the specific job document in Firestore realtime
            const jobRef = doc(db, "jobs", jobId);
            await updateDoc(jobRef, {
                status: 'accepted',
                workerName: 'Worker_123'
            });
            // Result is automatically pulled via onSnapshot!
        } catch (e) {
            console.error("Error updating document: ", e);
            alert("Error accepting job");
        }
    },

    renderWorkerJobs() {
        // clear old jobs (excluding empty state)
        const cards = this.workerJobsList.querySelectorAll('.job-card');
        cards.forEach(c => c.remove());

        if (!this.workerOnline) return;

        // Pending jobs available for grabbing
        const availableJobs = this.jobs.filter(j => j.status === 'pending');
        // Jobs accepted by this worker
        const myJobs = this.jobs.filter(j => j.status === 'accepted');

        const displayJobs = [...myJobs, ...availableJobs];

        if (displayJobs.length === 0) {
            this.workerEmptyState.style.display = 'block';
        } else {
            this.workerEmptyState.style.display = 'none';
            
            displayJobs.forEach(job => {
                const el = document.createElement('div');
                el.className = 'job-card';

                let actionHtml = '';
                if (job.status === 'pending') {
                    // Added app. prefix since window.app is mapped globally for module
                    actionHtml = `<button class="btn-success" onclick="app.acceptJob('${job.id}')">${this.t('action_accept')}</button>`;
                } else if (job.status === 'accepted') {
                     actionHtml = `<span class="badge accepted" style="padding: 0.75rem">${this.t('status_accepted')} ✓</span>`;
                }

                el.innerHTML = `
                    <div class="job-info">
                        <div class="job-title">${this.t(job.typeKey)}</div>
                        <div class="job-meta">
                            <span>🕒 ${this.t(job.urgencyKey)}</span>
                            <span>•</span>
                            <span class="wage-badge" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">${this.t('rupees')} ${job.wage}</span>
                        </div>
                    </div>
                    <div class="job-actions">
                        ${actionHtml}
                    </div>
                `;
                this.workerJobsList.appendChild(el);
            });
        }
    }
};

// Start app
window.onload = () => {
    app.init();
};
