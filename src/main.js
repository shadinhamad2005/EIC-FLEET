import { app, auth, db, getCol, getDocRef, signInAnonymously, onSnapshot, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, setDoc } from './firebase/config.js';
import { state, updateState, loadedFlags, subscribe } from './state.js';
import { renderApp } from './ui/views.js';
import { t, setLang } from './i18n.js';

// Subscribe to state changes to trigger UI re-renders
subscribe(renderApp);

// Global error handling
window.onerror = (msg, url, lineNo, columnNo, error) => {
    const errStr = `Error: ${msg} at line ${lineNo}`;
    console.error(errStr, error);
    showToast(errStr, "error");
    
    const debug = document.getElementById('loader-debug');
    if (debug) debug.innerHTML += `<br><span style="color:red">${errStr}</span>`;
    
    return false;
};

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
    const errStr = `Promise Rejection: ${event.reason}`;
    console.error(errStr);
    
    const debug = document.getElementById('loader-debug');
    if (debug) debug.innerHTML += `<br><span style="color:red">${errStr}</span>`;
});

window.flagInputError = function(inputId, message) {
    const input = document.getElementById(inputId);
    if (input) {
        input.classList.remove('input-error');
        void input.offsetWidth; // trigger reflow
        input.classList.add('input-error');
        setTimeout(() => input.classList.remove('input-error'), 2500);
    }
    document.getElementById('alert-modal-message').textContent = message;
    window.openModal('alert-modal');
    window.applyTranslations();
};

window.applyTranslations = function() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = t(key);
        } else {
            el.textContent = t(key);
        }
    });
};

window.switchLanguage = function(lang) {
    setLang(lang);
    renderApp();
    window.applyTranslations();
};

// Simple Toast implementation
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toasts-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Modal handlers
window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
};

window.openModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
};

async function init() {
    const debug = document.getElementById('loader-debug');
    if (debug) debug.innerHTML = 'Starting init()...<br>';
    
    try {
        // Wait for first auth state to avoid hitting network if user is cached
        const user = await new Promise((resolve) => {
            const unsubscribe = auth.onAuthStateChanged((u) => {
                unsubscribe();
                resolve(u);
            });
        });

        if (user) {
            if (debug) debug.innerHTML += 'Cached user found. Setting up listeners...<br>';
            setupRealtimeListeners();
        } else {
            if (debug) debug.innerHTML += 'No cached user. Calling signInAnonymously...<br>';
            await signInAnonymously(auth);
            if (debug) debug.innerHTML += 'SignIn successful. Setting up listeners...<br>';
            setupRealtimeListeners();
        }
    } catch (e) {
        if (debug) debug.innerHTML += `<br><span style="color:red">Init Error: ${e.message}</span>`;
        console.error("Firebase Init Error:", e);
        showToast("Connection required for first-time setup.", "error");
        setTimeout(init, 5000);
    }
}

function checkLoaded() {
    const debug = document.getElementById('loader-debug');
    if (debug) {
        debug.innerHTML = `
            Drivers: ${loadedFlags.drivers ? '✅' : '⏳'}<br>
            Admins: ${loadedFlags.admins ? '✅' : '⏳'}<br>
            Vehicles: ${loadedFlags.vehicles ? '✅' : '⏳'}<br>
            Logs: ${loadedFlags.logs ? '✅' : '⏳'}<br>
            Refuels: ${loadedFlags.refuels ? '✅' : '⏳'}<br>
            Broadcasts: ${loadedFlags.broadcasts ? '✅' : '⏳'}<br>
            Settings: ${loadedFlags.settings ? '✅' : '⏳'}
        `;
    }

    if (loadedFlags.drivers && loadedFlags.admins && loadedFlags.vehicles && loadedFlags.logs && loadedFlags.refuels && loadedFlags.broadcasts) {
        if (state.isLoading) {
            updateState({ isLoading: false });
            
            // Auto-Close orphaned trips older than 24 hours
            const now = new Date();
            state.logs.forEach(l => {
                if (l.endingKm == null && l.startTime) {
                    const diffHours = (now - new Date(l.startTime)) / (1000 * 60 * 60);
                    if (diffHours > 24) {
                        try {
                            updateDoc(getDocRef('logs', l.id), {
                                endingKm: l.startingKm, // Nullify distance driven
                                endTime: now.toISOString(),
                                status: 'Closed',
                                notes: 'Auto-closed by system (Timeout > 24h)'
                            });
                            updateDoc(getDocRef('vehicles', l.vehicleId), { status: 'Available' });
                        } catch (e) { console.error('Error auto-closing orphaned trip', e); }
                    }
                }
            });
            
            // Auto bypass logic if already logged in via cache
            const cachedDriverId = localStorage.getItem('eic_current_driver');
            if (cachedDriverId) {
                const driver = state.drivers.find(d => d.id === cachedDriverId);
                if (driver) {
                    const activeLog = state.logs.find(l => l.driverId === driver.id && l.endingKm == null);
                    if (activeLog) {
                        updateState({ view: 'active_trip', currentUser: driver, selectedVehicle: state.vehicles.find(v => v.id === activeLog.vehicleId) });
                    } else {
                        updateState({ view: 'vehicles', currentUser: driver });
                    }
                    showToast(`Welcome back, ${driver.name}`, 'success');
                } else {
                    localStorage.removeItem('eic_current_driver');
                }
            }
        }
        renderApp();
        window.applyTranslations();
    }
}

function setupRealtimeListeners() {
    onSnapshot(getCol('drivers'), snapshot => {
        state.drivers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedFlags.drivers = true;
        checkLoaded();
    });

    onSnapshot(getCol('admins'), snapshot => {
        state.admins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedFlags.admins = true;
        checkLoaded();
    });

    onSnapshot(getCol('vehicles'), snapshot => {
        state.vehicles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedFlags.vehicles = true;
        checkLoaded();
    });

    // Settings listener — must always resolve even if doc doesn't exist yet
    onSnapshot(getDocRef('settings', 'global'), doc => {
        if (doc.exists()) {
            state.settings = doc.data();
        } else {
            state.settings = { enableGeotagging: false };
        }
        // Settings is optional — don't block initial load
        loadedFlags.settings = true;
        checkLoaded();
    });

    // Pagination for logs
    state.logLimit = 100;
    let recentLogsUnsub = null;
    let activeLogsUnsub = null;

    const activeLogsMap = new Map();
    const recentLogsMap = new Map();

    const mergeLogs = () => {
        // Build merged map: recent first, then active overwrites any matching IDs to ensure fresh 'Open' state
        const merged = new Map([...recentLogsMap]);
        activeLogsMap.forEach((log, id) => merged.set(id, log));
        state.logs = Array.from(merged.values());
        loadedFlags.logs = true;
        checkLoaded();
    };

    // Real-time active logs (no limit)
    activeLogsUnsub = onSnapshot(
        query(getCol('logs'), where('status', '==', 'Open')), 
        snapshot => {
            activeLogsMap.clear();
            snapshot.docs.forEach(doc => activeLogsMap.set(doc.id, { id: doc.id, ...doc.data() }));
            mergeLogs();
        },
        err => { console.error('Active logs error:', err); loadedFlags.logs = true; checkLoaded(); }
    );

    // Paginated history logs
    window.subscribeRecentLogs = function() {
        if (recentLogsUnsub) recentLogsUnsub();
        recentLogsUnsub = onSnapshot(
            query(getCol('logs'), orderBy('startTime', 'desc'), limit(state.logLimit)), 
            snapshot => {
                recentLogsMap.clear();
                snapshot.docs.forEach(doc => recentLogsMap.set(doc.id, { id: doc.id, ...doc.data() }));
                mergeLogs();
            },
            err => { console.error('Recent logs error:', err); loadedFlags.logs = true; checkLoaded(); }
        );
    };

    window.subscribeRecentLogs();

    window.loadMoreLogs = function() {
        state.logLimit += 100;
        window.subscribeRecentLogs();
        showToast(`Loading up to ${state.logLimit} historical logs...`);
    };

    onSnapshot(getCol('refuels'), snapshot => {
        state.refuels = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedFlags.refuels = true;
        checkLoaded();
    });

    onSnapshot(getCol('broadcasts'), snapshot => {
        state.broadcasts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedFlags.broadcasts = true;
        checkLoaded();
    });
}

// Global actions
window.handleLogin = async function(role, id = null) {
    if (role === 'admin') {
        const pin = document.getElementById('admin-pin-input').value;
        
        // Hash check for super admin
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        if (hashHex === 'f04ed3aab563aa7cb386da5ae5dce216bbd1520c76210e62cb56264c6513ab7b') {
            updateState({ view: 'admin', adminRole: 'super' });
            showToast('Admin Access Granted');
        } else {
            const admin = state.admins.find(a => a.pin === pin);
            if (admin) {
                updateState({ view: 'admin', adminRole: 'regular' });
                showToast(`Welcome Admin ${admin.name}`);
            } else {
                showToast('Invalid PIN', 'error');
            }
        }
    } else if (role === 'driver') {
        const driverId = document.getElementById('driver-select').value;
        const pin = document.getElementById('login-driver-pin-input').value;
        const driver = state.drivers.find(d => d.id === driverId);
        
        if (!driver) return showToast('Select a driver', 'warning');
        if (driver.pin !== pin.trim()) return showToast('Invalid PIN', 'error');
        
        localStorage.setItem('eic_current_driver', driver.id);
        
        const activeLog = state.logs.find(l => l.driverId === driver.id && l.endingKm == null);
        if (activeLog) {
            updateState({ view: 'active_trip', currentUser: driver, selectedVehicle: state.vehicles.find(v => v.id === activeLog.vehicleId) });
        } else {
            updateState({ view: 'vehicles', currentUser: driver });
        }
        showToast(`Logged in as ${driver.name}`);
    }
};

window.handleLogout = function() {
    localStorage.removeItem('eic_current_driver');
    updateState({ view: 'login', currentUser: null, adminRole: null, selectedVehicle: null });
    showToast('Logged out successfully');
};

function showAnimation(type) {
    const overlay = document.getElementById('animation-overlay');
    const iconContainer = document.getElementById('anim-icon-container');
    const icon = document.getElementById('anim-icon');
    const text = document.getElementById('anim-text');
    
    iconContainer.className = 'anim-icon-box'; // reset
    
    if (type === 'start') {
        icon.className = 'fas fa-car-side';
        text.textContent = 'Processing Route...';
        iconContainer.classList.add('drive-away');
    } else {
        icon.className = 'fas fa-car-side';
        text.textContent = 'Securing Vehicle...';
        iconContainer.classList.add('drive-park');
    }
    
    overlay.classList.remove('hidden');
    
    return new Promise(resolve => {
        setTimeout(() => {
            overlay.classList.add('active');
            
            // Minimum 1.5s animation duration
            setTimeout(() => {
                resolve({
                    hide: (finalText) => {
                        text.textContent = finalText;
                        setTimeout(() => {
                            overlay.classList.remove('active');
                            setTimeout(() => overlay.classList.add('hidden'), 500);
                        }, 800); // Show final text briefly before fading out
                    }
                });
            }, 1500);
        }, 10);
    });
}

window.openReadyModal = function(type, vehicleId = null) {
    if (!state.settings?.enableGeotagging) {
        if (type === 'start') return window.openStartModal(vehicleId);
        if (type === 'stop') return window.openStopModal();
    }
    
    // Store type and vehicle for confirm
    window._readyType = type;
    window._readyVehicle = vehicleId;
    
    const titleEl = document.getElementById('ready-modal-title');
    const cancelBtn = document.getElementById('ready-modal-cancel');
    const confirmBtn = document.getElementById('ready-modal-confirm');
    
    if (titleEl) {
        titleEl.textContent = type === 'start' ? 'Are you ready to start the trip?' : 'Are you ready to end the trip?';
    }
    if (cancelBtn) {
        cancelBtn.textContent = type === 'start' ? 'No, cancel' : 'Cancel';
    }
    if (confirmBtn) {
        confirmBtn.textContent = type === 'start' ? 'Yes, I\'m ready' : 'End Trip';
    }
    
    openModal('ready-modal');
};

window.confirmReady = async function(isReady) {
    if (!isReady) {
        closeModal('ready-modal');
        window._tempLocationCoords = null; // No location grabbed
    } else {
        closeModal('ready-modal');
    }
    
    if (isReady) {
        // Proceed to actual modal based on the stored type
        if (window._readyType === 'start') {
            window.openStartModal(window._readyVehicle);
        } else {
            window.openStopModal();
        }
    }
};

window.confirmTakeOver = function(vid, driverName) {
    if (confirm(`Are you sure? ${driverName} has not closed their trip.`)) {
        window.openReadyModal('start', vid);
    }
};

window.openStartModal = function(vid) {
    const vehicle = state.vehicles.find(v => v.id === vid);
    if (!vehicle) return;
    
    updateState({ selectedVehicle: vehicle });
    
    let lastKm = 0;
    const pastLogs = state.logs.filter(l => l.vehicleId === vid && l.endingKm != null);
    if (pastLogs.length > 0) {
        lastKm = Math.max(...pastLogs.map(l => Number(l.endingKm)));
    }

    document.getElementById('start-km-input').value = lastKm || '';
    // Set hint using translated text if needed, here we just concatenate
    document.getElementById('last-km-hint').textContent = `${t('previous_ending')}: ${lastKm.toLocaleString()} KM`;
    document.getElementById('purpose-input').value = '';
    
    openModal('start-modal');
    window.applyTranslations(); // ensure modal is translated
};

window.toggleSetting = async function(key, value) {
    try {
        await updateDoc(getDocRef('settings', 'global'), {
            [key]: value
        });
        showToast('Settings updated');
    } catch (e) {
        try {
            await setDoc(getDocRef('settings', 'global'), {
                [key]: value
            });
            showToast('Settings initialized');
        } catch(err) {
            showToast('Failed to save settings', 'error');
        }
    }
};

window.confirmStartDriving = async function() {
    const startKm = parseInt(document.getElementById('start-km-input').value);
    const purpose = document.getElementById('purpose-input').value.trim();
    
    if (isNaN(startKm)) return flagInputError('start-km-input', t('err_invalid_start'));
    if (!purpose) return flagInputError('purpose-input', t('err_no_purpose'));

    const vehicle = state.selectedVehicle;
    if (!vehicle) return;

    // Security Check: Odometer must be >= last ending KM
    let lastKm = 0;
    let lastTimestamp = null;
    
    const pastLogs = state.logs.filter(l => l.vehicleId === vehicle.id && l.endingKm != null);
    const pastRefuels = state.refuels.filter(r => r.vehicleId === vehicle.id);
    
    pastLogs.forEach(l => {
        if (Number(l.endingKm) > lastKm) {
            lastKm = Number(l.endingKm);
            lastTimestamp = l.endTime || l.timestamp;
        }
    });
    pastRefuels.forEach(r => {
        if (Number(r.odometer) > lastKm) {
            lastKm = Number(r.odometer);
            lastTimestamp = r.timestamp;
        }
    });
    
    if (!lastTimestamp) lastTimestamp = new Date().toISOString();

    if (startKm < lastKm) {
        return flagInputError('start-km-input', `${t('err_start_less')} (${lastKm} KM)`);
    }
    
    if (lastKm > 0 && startKm > lastKm + 5000) {
        return flagInputError('start-km-input', 'Starting KM is suspiciously high! Please check again or contact Admin.');
    }

    closeModal('start-modal');
    
    // Start animation immediately so the UI is responsive
    const animPromise = showAnimation('start');
    
    // Use the location we grabbed in the Ready Modal (if any)

    window._tempLocationCoords = null; // Clear it so it's not reused accidentally
    
    const firebasePromise = (async () => {
        // Auto-Close logic for forgotten trips
        const activeLog = state.logs.find(l => l.vehicleId === vehicle.id && l.endingKm == null);
        if (activeLog) {
            try {
                await updateDoc(getDocRef('logs', activeLog.id), {
                    endingKm: startKm,
                    endTime: new Date().toISOString(),
                    status: 'Closed',
                    notes: 'Auto-closed by system (Another driver took over)'
                });
            } catch (e) {
                console.error('Error auto-closing previous log:', e);
            }
        } else {
            // GHOST GAP AUTO-LOGGING for Assigned Primary Drivers
            // Only trigger if there is no active log currently overriding this gap.
            const gap = startKm - lastKm;
            if (gap >= 5 && vehicle.assignedDriverId && lastKm > 0) {
                try {
                    await addDoc(getCol('logs'), {
                        vehicleId: vehicle.id,
                        driverId: vehicle.assignedDriverId,
                        startingKm: lastKm,
                        endingKm: startKm,
                        timestamp: lastTimestamp,
                        startTime: lastTimestamp,
                        endTime: new Date().toISOString(),
                        purpose: 'Auto-calculated (Primary Driver mileage)',
                        notes: 'Auto-calculated (Primary Driver mileage)',
                        status: 'Closed'
                    });
                } catch (e) {
                    console.error('Error auto-logging gap:', e);
                }
            }
        }

        // CREATE new active log for current driver
        await addDoc(getCol('logs'), {
            vehicleId: vehicle.id,
            driverId: state.currentUser.id,
            startTime: new Date().toISOString(),
            startingKm: startKm,

            endingKm: null,
            purpose: purpose,
            notes: '',
            status: 'Open'
        });
        await updateDoc(getDocRef('vehicles', vehicle.id), { status: 'In Use' });
    })().catch(e => console.error('Firebase background sync error:', e));

    try {
        const anim = await animPromise;
        
        updateState({ view: 'active_trip' });
        anim.hide('Trip Started Successfully!');
    } catch (error) {
        console.error(error);
        const anim = await animPromise;
        anim.hide('Error Starting Trip');
        showToast('Failed to start trip', 'error');
    }
};

window.openStopModal = function() {
    document.getElementById('ending-km-input').value = '';
    document.getElementById('trip-notes-input').value = '';
    openModal('stop-modal');
};

window.confirmStopDriving = async function() {
    const endingKm = parseInt(document.getElementById('ending-km-input').value);
    const notes = document.getElementById('trip-notes-input').value.trim();
    
    if (isNaN(endingKm)) return flagInputError('ending-km-input', t('err_invalid_end'));
    
    const vehicle = state.selectedVehicle;
    const driver = state.currentUser;
    
    const activeLog = state.logs.find(l => l.vehicleId === vehicle.id && l.driverId === driver.id && l.endingKm == null);
    if (!activeLog) return showToast('No active trip found to stop', 'error');

    // Security Check: Odometer must be > starting KM
    if (endingKm <= activeLog.startingKm) {
        return flagInputError('ending-km-input', `Ending KM must be greater than Starting KM (${activeLog.startingKm})`);
    }
    if (endingKm > activeLog.startingKm + 5000) {
        return flagInputError('ending-km-input', 'Ending KM is suspiciously high! Please check again or contact Admin.');
    }

    closeModal('stop-modal');
    
    const animPromise = showAnimation('stop');
    
    // Use the location we grabbed in the Ready Modal (if any)

    window._tempLocationCoords = null;
    
    const firebasePromise = (async () => {
        await updateDoc(getDocRef('logs', activeLog.id), {
            endingKm: endingKm,
            endTime: new Date().toISOString(),

            notes: notes,
            status: 'Closed'
        });
        await updateDoc(getDocRef('vehicles', vehicle.id), { status: 'Available' });
    })().catch(e => console.error('Firebase background sync error:', e));

    try {
        const anim = await animPromise;
        
        updateState({ view: 'vehicles', selectedVehicle: null });
        anim.hide('Vehicle Parked Safely!');
    } catch (error) {
        console.error(error);
        const anim = await animPromise;
        anim.hide('Error Parking Vehicle');
        showToast('Failed to park vehicle', 'error');
    }
};

window.openRefuelModal = function() {
    document.getElementById('refuel-km-input').value = '';
    openModal('refuel-modal');
};

window.confirmRefuel = async function() {
    const currentKm = parseInt(document.getElementById('refuel-km-input').value);
    
    if (isNaN(currentKm)) return showToast('Please enter the current odometer reading', 'error');
    
    const vehicle = state.selectedVehicle;
    const driver = state.currentUser;
    
    if (!vehicle || !driver) return showToast('Active trip context lost', 'error');

    closeModal('refuel-modal');
    
    const activeLog = state.logs.find(l => l.vehicleId === vehicle.id && l.driverId === driver.id && l.endingKm == null);
    
    // Optimistic offline write
    addDoc(getCol('refuels'), {
        vehicleId: vehicle.id,
        driverId: driver.id,
        tripId: activeLog ? activeLog.id : null,
        odometer: currentKm,
        timestamp: new Date().toISOString(),
        isFullTank: true
    }).catch(e => console.error('Firebase sync background error:', e));
    
    showToast('Refuel logged successfully!', 'success');
};

window.switchAdminTab = function(tab) {
    updateState({ adminTab: tab });
};

window.togglePin = function(id) {
    const el = document.getElementById(`pin-${id}`);
    const icon = document.getElementById(`pin-icon-${id}`);
    if (el.textContent === '••••') {
        el.textContent = el.getAttribute('data-pin');
        icon.className = 'fas fa-eye-slash';
    } else {
        el.textContent = '••••';
        icon.className = 'fas fa-eye';
    }
};

window.openDriverModal = function(id = null) {
    const nameInput = document.getElementById('driver-name-input');
    const pinInput = document.getElementById('driver-pin-input');
    const idInput = document.getElementById('driver-id-input');
    const title = document.getElementById('driver-modal-title');
    const delBtn = document.getElementById('btn-delete-driver');
    
    if (id) {
        const driver = state.drivers.find(d => d.id === id);
        if (!driver) return;
        nameInput.value = driver.name;
        pinInput.value = driver.pin || '';
        idInput.value = driver.id;
        title.textContent = 'Edit Driver';
        delBtn.style.display = 'block';
    } else {
        nameInput.value = '';
        pinInput.value = '';
        idInput.value = '';
        title.textContent = 'Add Driver';
        delBtn.style.display = 'none';
    }
    openModal('driver-modal');
};

window.saveDriver = async function() {
    const id = document.getElementById('driver-id-input').value;
    const name = document.getElementById('driver-name-input').value.trim();
    const pin = document.getElementById('driver-pin-input').value.trim();
    
    if (!name) return showToast('Name is required', 'error');

    if (id) {
        updateDoc(getDocRef('drivers', id), { name, pin }).catch(e => console.error(e));
        showToast('Driver updated', 'success');
    } else {
        addDoc(getCol('drivers'), { name, pin, role: 'driver' }).catch(e => console.error(e));
        showToast('Driver added', 'success');
    }
    closeModal('driver-modal');
};

window.deleteDriver = async function() {
    const id = document.getElementById('driver-id-input').value;
    if(!id) return;
    if(!confirm("Are you sure you want to permanently delete this driver?")) return;
    deleteDoc(getDocRef('drivers', id)).catch(e => console.error(e));
    showToast('Driver deleted', 'success');
    closeModal('driver-modal');
};

window.openVehicleModal = function(id = null) {
    const driverSelect = document.getElementById('vehicle-assigned-driver-select');
    driverSelect.innerHTML = '<option value="">-- None --</option>' + state.drivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

    if (id) {
        const vehicle = state.vehicles.find(v => v.id === id);
        document.getElementById('vehicle-id-input').value = vehicle.id;
        document.getElementById('vehicle-make-input').value = vehicle.makeModel;
        document.getElementById('vehicle-assigned-driver-select').value = vehicle.assignedDriverId || '';
        document.getElementById('vehicle-plate-input').value = vehicle.plate || '';
        document.getElementById('vehicle-last-service-input').value = vehicle.lastServiceKm || 0;
        document.getElementById('vehicle-service-interval-input').value = vehicle.serviceIntervalKm || 10000;
        document.getElementById('vehicle-modal-title').textContent = 'Edit Vehicle';
        document.getElementById('btn-delete-vehicle').style.display = 'block';
    } else {
        document.getElementById('vehicle-id-input').value = '';
        document.getElementById('vehicle-make-input').value = '';
        document.getElementById('vehicle-assigned-driver-select').value = '';
        document.getElementById('vehicle-plate-input').value = '';
        document.getElementById('vehicle-last-service-input').value = 0;
        document.getElementById('vehicle-service-interval-input').value = 10000;
        document.getElementById('vehicle-modal-title').textContent = 'Add Vehicle';
        document.getElementById('btn-delete-vehicle').style.display = 'none';
    }
    openModal('vehicle-modal');
};

window.saveVehicle = async function() {
    const id = document.getElementById('vehicle-id-input').value;
    const makeModel = document.getElementById('vehicle-make-input').value.trim();
    const assignedDriverId = document.getElementById('vehicle-assigned-driver-select').value;
    const plate = document.getElementById('vehicle-plate-input').value.trim();
    const lastServiceKm = parseInt(document.getElementById('vehicle-last-service-input').value) || 0;
    const serviceIntervalKm = parseInt(document.getElementById('vehicle-service-interval-input').value) || 10000;
    
    if (!makeModel) return showToast('Please enter a Make & Model', 'error');

    const vehicleData = {
        makeModel,
        plate,
        assignedDriverId,
        lastServiceKm,
        serviceIntervalKm
    };

    if (id) {
        updateDoc(getDocRef('vehicles', id), vehicleData).catch(e => console.error(e));
        showToast('Vehicle updated successfully');
    } else {
        vehicleData.status = 'Available';
        addDoc(getCol('vehicles'), vehicleData).catch(e => console.error(e));
        showToast('Vehicle added successfully');
    }
    closeModal('vehicle-modal');
};

window.logVehicleService = async function(vehicleId) {
    const vehicle = state.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;

    // Calculate absolute current KM
    let currentKm = 0;
    const allLogs = state.logs.filter(l => l.vehicleId === vehicleId && l.endingKm != null);
    const allRefuels = state.refuels.filter(r => r.vehicleId === vehicleId);
    const maxLogKm = allLogs.length > 0 ? Math.max(...allLogs.map(l => Number(l.endingKm))) : 0;
    const maxRefuelKm = allRefuels.length > 0 ? Math.max(...allRefuels.map(r => Number(r.odometer))) : 0;
    currentKm = Math.max(maxLogKm, maxRefuelKm);

    if (currentKm === 0) {
        return showToast('Cannot log service: Vehicle has no recorded mileage.', 'error');
    }

    if (confirm(`Confirm maintenance completed for ${vehicle.makeModel} at ${currentKm} KM?`)) {
        updateDoc(getDocRef('vehicles', vehicleId), {
            lastServiceKm: currentKm
        }).catch(e => console.error(e));
        showToast('Maintenance logged successfully');
    }
};

window.deleteVehicle = async function() {
    const id = document.getElementById('vehicle-id-input').value;
    if(!id) return;
    if(!confirm("Are you sure you want to permanently delete this vehicle?")) return;
    deleteDoc(getDocRef('vehicles', id)).catch(e => console.error(e));
    showToast('Vehicle deleted successfully');
    closeModal('vehicle-modal');
};

window.adminForceCloseTrip = async function(logId, vehicleId) {
    if (!vehicleId) return showToast('Vehicle not found', 'error');
    const endingKmStr = prompt("Enter the final Odometer reading to force close this trip:");
    if (endingKmStr === null) return; // User cancelled
    
    const endingKm = parseInt(endingKmStr);
    if (isNaN(endingKm)) return showToast('Please enter a valid ending KM', 'error');
    
    updateDoc(getDocRef('logs', logId), {
        endingKm: endingKm,
        endTime: new Date().toISOString(),
        notes: 'Force closed by Admin',
        status: 'Closed'
    }).catch(e => console.error(e));
    updateDoc(getDocRef('vehicles', vehicleId), { status: 'Available' }).catch(e => console.error(e));
    showToast('Trip force closed successfully', 'success');
};

window.sendBroadcast = async function() {
    const msg = prompt("Enter announcement message to broadcast to all drivers:");
    if (!msg || !msg.trim()) return;
    addDoc(getCol('broadcasts'), {
        message: msg.trim(),
        timestamp: new Date().toISOString()
    }).catch(e => console.error(e));
    showToast('Announcement broadcasted!', 'success');
};

window.dismissBroadcast = function(id) {
    localStorage.setItem(`eic_dismissed_broadcast_${id}`, 'true');
    const banner = document.getElementById('global-broadcast-banner');
    if (banner) banner.style.display = 'none';
};

// --- Trip Logs Management (Admin) ---

window.setTripFilter = function(type, value) {
    if (type === 'start') state.tripFilterStart = value;
    if (type === 'end') state.tripFilterEnd = value;
    renderApp();
};

window.clearTripFilter = function() {
    state.tripFilterStart = '';
    state.tripFilterEnd = '';
    renderApp();
};

window.exportTripLogsPDF = async function() {
    // Dynamically load scripts if not present to avoid offline blocking on startup
    if (typeof window.jspdf === 'undefined') {
        showToast('Loading PDF engine, please wait...', 'warning');
        try {
            await new Promise((resolve, reject) => {
                const s1 = document.createElement('script');
                s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                s1.onload = resolve;
                s1.onerror = reject;
                document.head.appendChild(s1);
            });
            await new Promise((resolve, reject) => {
                const s2 = document.createElement('script');
                s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js';
                s2.onload = resolve;
                s2.onerror = reject;
                document.head.appendChild(s2);
            });
        } catch(e) {
            return showToast('Failed to load PDF library. Check your internet connection.', 'error');
        }
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');

    // 1. Filter logic based on Admin State
    const filterStart = state.tripFilterStart ? new Date(state.tripFilterStart).getTime() : 0;
    const filterEnd = state.tripFilterEnd ? new Date(state.tripFilterEnd).getTime() + 86400000 : Infinity; // Include whole day

    let filteredLogs = [...state.logs];
    if (filterStart || filterEnd !== Infinity) {
        filteredLogs = filteredLogs.filter(l => {
            const logTime = new Date(l.startTime).getTime();
            return logTime >= filterStart && logTime <= filterEnd;
        });
    }
    const sortedLogs = filteredLogs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    // 2. Map data for AutoTable
    const tableData = sortedLogs.map(l => {
        const v = state.vehicles.find(v => v.id === l.vehicleId);
        const d = state.drivers.find(d => d.id === l.driverId);
        
        const startObj = new Date(l.startTime);
        const startStr = startObj.toLocaleDateString() + ' ' + startObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        let endStr = 'In Progress';
        if (l.endTime) {
            const endObj = new Date(l.endTime);
            endStr = endObj.toLocaleDateString() + ' ' + endObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
        
        const vehicleStr = v ? `${v.makeModel} (${v.plate || 'N/A'})` : 'Unknown Vehicle';
        const driverStr = d ? d.name : 'Unknown Driver';
        const odoStr = `${l.startingKm} - ${l.endingKm || 'Active'}`;
        const statusStr = (l.status === 'Open' || !l.endingKm) ? 'Active' : 'Closed';
        const purposeStr = l.purpose || l.notes || '';

        return [startStr, endStr, vehicleStr, driverStr, odoStr, statusStr, purposeStr];
    });

    // 3. Build PDF
    doc.setFontSize(18);
    doc.text('Fleet Trip Logs Report', 14, 22);
    
    doc.setFontSize(11);
    let subtitle = 'All Time';
    if (state.tripFilterStart || state.tripFilterEnd) {
        subtitle = `Date Range: ${state.tripFilterStart || 'Beginning'} to ${state.tripFilterEnd || 'Today'}`;
    }
    doc.text(subtitle, 14, 30);
    
    doc.autoTable({
        startY: 36,
        head: [['Start Time', 'End Time', 'Vehicle', 'Driver', 'Odometer', 'Status', 'Purpose/Notes']],
        body: tableData,
        theme: 'striped',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [15, 23, 42] },
        margin: { top: 36 }
    });

    // 4. Save
    const filename = `Fleet_Trip_Logs_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
    showToast('PDF downloaded successfully!', 'success');
};

window.openEditTripModal = function(logId) {
    try {
        const log = state.logs.find(l => l.id === logId);
        if (!log) {
            alert('Error: Log not found in state!');
            return;
        }
        
        document.getElementById('edit-trip-id').value = log.id;
        
        const formatForInput = (dateVal) => {
            if (!dateVal) return '';
            let date;
            if (typeof dateVal === 'object' && dateVal.toDate) {
                date = dateVal.toDate();
            } else if (dateVal instanceof Date) {
                date = dateVal;
            } else {
                date = new Date(dateVal);
            }
            if (isNaN(date.getTime())) return '';
            return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0,16);
        };
        
        document.getElementById('edit-trip-start-time').value = formatForInput(log.startTime);
        document.getElementById('edit-trip-end-time').value = formatForInput(log.endTime);
        document.getElementById('edit-trip-start-km').value = log.startingKm || '';
        document.getElementById('edit-trip-end-km').value = log.endingKm || '';
        document.getElementById('edit-trip-notes').value = log.notes || log.purpose || '';

        // Populate Driver dropdown
        const driverSelect = document.getElementById('edit-trip-driver');
        driverSelect.innerHTML = '<option value="">-- Select Driver --</option>' +
            state.drivers.map(d =>
                `<option value="${d.id}" ${d.id === log.driverId ? 'selected' : ''}>${d.name}</option>`
            ).join('');

        // Populate Vehicle dropdown
        const vehicleSelect = document.getElementById('edit-trip-vehicle');
        vehicleSelect.innerHTML = '<option value="">-- Select Vehicle --</option>' +
            state.vehicles.map(v =>
                `<option value="${v.id}" ${v.id === log.vehicleId ? 'selected' : ''}>${v.makeModel} — ${v.plate || ''}</option>`
            ).join('');
        
        openModal('edit-trip-modal');
    } catch (e) {
        alert('Edit Modal Error: ' + e.message);
        console.error('Edit modal error:', e);
    }
};

window.saveTripEdit = async function() {
    const id = document.getElementById('edit-trip-id').value;
    const startTimeRaw = document.getElementById('edit-trip-start-time').value;
    const endTimeRaw = document.getElementById('edit-trip-end-time').value;
    const startingKm = parseInt(document.getElementById('edit-trip-start-km').value);
    const endingKm = parseInt(document.getElementById('edit-trip-end-km').value);
    const notes = document.getElementById('edit-trip-notes').value.trim();
    const driverId = document.getElementById('edit-trip-driver').value;
    const vehicleId = document.getElementById('edit-trip-vehicle').value;
    
    if (!id || !startTimeRaw || isNaN(startingKm)) return showToast('Start Time and Start KM are required', 'error');

    const updates = {
        startTime: new Date(startTimeRaw).toISOString(),
        startingKm: startingKm,
        notes: notes
    };
    
    if (endTimeRaw) updates.endTime = new Date(endTimeRaw).toISOString();
    if (!isNaN(endingKm)) updates.endingKm = endingKm;
    if (driverId) updates.driverId = driverId;
    if (vehicleId) updates.vehicleId = vehicleId;

    updateDoc(getDocRef('logs', id), updates).catch(e => console.error(e));
    showToast('Trip updated successfully');
    closeModal('edit-trip-modal');
};

window.deleteTrip = async function(logId) {
    const log = state.logs.find(l => l.id === logId);
    if (!log) return;
    if (log.status === 'Open') return showToast('Cannot delete an active trip', 'error');
    
    if (!confirm('Are you sure you want to permanently delete this trip log?')) return;
    
    deleteDoc(getDocRef('logs', logId)).catch(e => console.error(e));
    showToast('Trip deleted successfully');
};



// Start application
init();
