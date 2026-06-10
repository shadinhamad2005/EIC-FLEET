import { app, auth, db, getCol, getDocRef, signInAnonymously, onSnapshot, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, setDoc } from './firebase/config.js?v=22';
import { state, updateState, loadedFlags, subscribe } from './state.js?v=22';
import { renderApp } from './ui/views.js?v=22';
import { t, setLang } from './i18n.js?v=22';

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
        if (debug) debug.innerHTML += 'Calling signInAnonymously...<br>';
        await signInAnonymously(auth);
        
        if (debug) debug.innerHTML += 'SignIn successful. Setting up listeners...<br>';
        setupRealtimeListeners();
    } catch (e) {
        if (debug) debug.innerHTML += `<br><span style="color:red">Init Error: ${e.message}</span>`;
        console.error("Firebase Init Error:", e);
        showToast("Connection failed. Retrying...", "error");
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
window.handleLogin = function(role, id = null) {
    if (role === 'admin') {
        const pin = document.getElementById('admin-pin-input').value;
        if (pin === '8891190911') {
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
        const pin = document.getElementById('driver-pin-input').value;
        const driver = state.drivers.find(d => d.id === driverId);
        
        if (!driver) return showToast('Select a driver', 'warning');
        if (driver.pin !== pin) return showToast('Invalid PIN', 'error');
        
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

    closeModal('start-modal');
    
    // Get Geolocation if enabled
    let locationCoords = null;
    if (state.settings?.enableGeotagging) {
        locationCoords = await new Promise((resolve) => {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => resolve(null),
                { timeout: 5000 }
            );
        });
    }
    
    // Start animation and firebase in parallel
    const animPromise = showAnimation('start');
    
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
            if (gap >= 5 && vehicle.assignedDriverId) {
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
            startLocation: locationCoords,
            endingKm: null,
            purpose: purpose,
            notes: '',
            status: 'Open'
        });
        await updateDoc(getDocRef('vehicles', vehicle.id), { status: 'In Use' });
    })();

    try {
        const [anim] = await Promise.all([animPromise, firebasePromise]);
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

    // Security Check: Odometer must be >= starting KM
    if (endingKm < activeLog.startingKm) {
        return flagInputError('ending-km-input', `${t('err_end_less')} (${activeLog.startingKm} KM)`);
    }

    closeModal('stop-modal');
    
    let locationCoords = null;
    if (state.settings?.enableGeotagging) {
        locationCoords = await new Promise((resolve) => {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => resolve(null),
                { timeout: 5000 }
            );
        });
    }
    
    const animPromise = showAnimation('stop');
    
    const firebasePromise = (async () => {
        await updateDoc(getDocRef('logs', activeLog.id), {
            endingKm: endingKm,
            endTime: new Date().toISOString(),
            endLocation: locationCoords,
            notes: notes,
            status: 'Closed'
        });
        await updateDoc(getDocRef('vehicles', vehicle.id), { status: 'Available' });
    })();

    try {
        const [anim] = await Promise.all([animPromise, firebasePromise]);
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
    
    try {
        // Optimistic offline write
        await addDoc(getCol('refuels'), {
            vehicleId: vehicle.id,
            driverId: driver.id,
            odometer: currentKm,
            timestamp: new Date().toISOString(),
            isFullTank: true
        });
        showToast('Refuel logged successfully!', 'success');
    } catch (error) {
        console.error(error);
        showToast('Failed to log refuel. Will retry automatically.', 'warning');
    }
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

    try {
        if (id) {
            await updateDoc(getDocRef('drivers', id), { name, pin });
            showToast('Driver updated', 'success');
        } else {
            await addDoc(getCol('drivers'), { name, pin, role: 'driver' });
            showToast('Driver added', 'success');
        }
        closeModal('driver-modal');
    } catch(e) {
        console.error(e);
        showToast('Error saving driver', 'error');
    }
};

window.deleteDriver = async function() {
    const id = document.getElementById('driver-id-input').value;
    if(!id) return;
    if(!confirm("Are you sure you want to permanently delete this driver?")) return;
    try {
        await deleteDoc(getDocRef('drivers', id));
        showToast('Driver deleted', 'success');
        closeModal('driver-modal');
    } catch(e) {
        console.error(e);
        showToast('Error deleting driver', 'error');
    }
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

    try {
        if (id) {
            await updateDoc(getDocRef('vehicles', id), vehicleData);
            showToast('Vehicle updated successfully');
        } else {
            vehicleData.status = 'Available';
            await addDoc(getCol('vehicles'), vehicleData);
            showToast('Vehicle added successfully');
        }
        closeModal('vehicle-modal');
    } catch (e) {
        console.error(e);
        showToast('Error saving vehicle', 'error');
    }
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
        try {
            await updateDoc(getDocRef('vehicles', vehicleId), {
                lastServiceKm: currentKm
            });
            showToast('Maintenance logged successfully');
        } catch (e) {
            console.error(e);
            showToast('Error logging maintenance', 'error');
        }
    }
};

window.deleteVehicle = async function() {
    const id = document.getElementById('vehicle-id-input').value;
    if(!id) return;
    if(!confirm("Are you sure you want to permanently delete this vehicle?")) return;
    try {
        await deleteDoc(getDocRef('vehicles', id));
        showToast('Vehicle deleted', 'success');
        closeModal('vehicle-modal');
    } catch(e) {
        console.error(e);
        showToast('Error deleting vehicle', 'error');
    }
};

window.adminForceCloseTrip = async function(logId, vehicleId) {
    if (!vehicleId) return showToast('Vehicle not found', 'error');
    const endingKmStr = prompt("Enter the final Odometer reading to force close this trip:");
    if (endingKmStr === null) return; // User cancelled
    
    const endingKm = parseInt(endingKmStr);
    if (isNaN(endingKm)) return showToast('Please enter a valid ending KM', 'error');
    
    try {
        await updateDoc(getDocRef('logs', logId), {
            endingKm: endingKm,
            endTime: new Date().toISOString(),
            notes: 'Force closed by Admin',
            status: 'Closed'
        });
        await updateDoc(getDocRef('vehicles', vehicleId), { status: 'Available' });
        showToast('Trip force closed successfully', 'success');
    } catch (e) {
        console.error(e);
        showToast('Failed to force close trip', 'error');
    }
};

window.sendBroadcast = async function() {
    const msg = prompt("Enter announcement message to broadcast to all drivers:");
    if (!msg || !msg.trim()) return;
    try {
        await addDoc(getCol('broadcasts'), {
            message: msg.trim(),
            timestamp: new Date().toISOString()
        });
        showToast('Announcement broadcasted!', 'success');
    } catch(e) {
        console.error(e);
        showToast('Failed to send announcement', 'error');
    }
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

window.exportTripLogsPDF = function() {
    const element = document.getElementById('trips-table-container');
    if (!element) return;
    
    // Temporarily show title for PDF and hide action columns
    const title = document.getElementById('pdf-report-title');
    if (title) title.style.display = 'block';
    
    const noPrintElements = element.querySelectorAll('.no-print');
    noPrintElements.forEach(el => el.style.display = 'none');

    const opt = {
        margin:       0.5,
        filename:     `Fleet_Trip_Logs_${new Date().toISOString().split('T')[0]}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'landscape' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        // Restore UI
        if (title) title.style.display = 'none';
        noPrintElements.forEach(el => el.style.display = '');
    });
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

    try {
        await updateDoc(getDocRef('logs', id), updates);
        showToast('Trip updated successfully');
        closeModal('edit-trip-modal');
    } catch (e) {
        console.error(e);
        showToast('Error updating trip', 'error');
    }
};

window.deleteTrip = async function(logId) {
    const log = state.logs.find(l => l.id === logId);
    if (!log) return;
    if (log.status === 'Open') return showToast('Cannot delete an active trip', 'error');
    
    if (!confirm('Are you sure you want to permanently delete this trip log?')) return;
    
    try {
        await deleteDoc(getDocRef('logs', logId));
        showToast('Trip deleted successfully');
    } catch (e) {
        console.error(e);
        showToast('Error deleting trip', 'error');
    }
};

let fleetMap = null;

// ✅ MAPBOX ACCESS TOKEN — Replace with your own from https://account.mapbox.com
const MAPBOX_TOKEN = 'pk.eyJ1Ijoic2hhbmlkOTExIiwiYSI6ImNtcTduYjJucTAxY3MycXNkMm93bXhwZ3cifQ.pvCFIRDr4EfkBQ8Q0QrluA';

window.openMapModal = async function(tripId) {
    const log = state.logs.find(l => l.id === tripId);
    if (!log) { showToast('Trip not found', 'error'); return; }

    document.getElementById('map-start-text').innerText = 'Locating...';
    document.getElementById('map-end-text').innerText = 'Trip in progress...';
    document.getElementById('map-distance-text').innerText = '—';

    openModal('map-modal');

    // Destroy previous map completely
    if (fleetMap) { fleetMap.remove(); fleetMap = null; }
    document.getElementById('map-container').innerHTML = '';

    await new Promise(r => setTimeout(r, 400));

    const start = log.startLocation;
    const end   = log.endLocation;

    // Reverse geocode using Mapbox
    const getPlaceName = async (lat, lng) => {
        try {
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&types=poi,address,neighborhood,place&limit=1`
            );
            const data = await res.json();
            return data.features?.[0]?.place_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        } catch(e) {
            return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
    };

    if (!start && !end) {
        document.getElementById('map-start-text').innerText = 'No GPS data — Geotagging was OFF for this trip';
        document.getElementById('map-end-text').innerText = 'Go to Admin → Settings → enable GPS Geotagging';
        document.getElementById('map-distance-text').innerText = 'N/A';

        fleetMap = new mapboxgl.Map({
            container: 'map-container',
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [55.2708, 25.2048],
            zoom: 8,
            accessToken: MAPBOX_TOKEN
        });
        return;
    }

    const center = start ? [start.lng, start.lat] : [end.lng, end.lat];

    fleetMap = new mapboxgl.Map({
        container: 'map-container',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: center,
        zoom: 14,
        accessToken: MAPBOX_TOKEN
    });

    fleetMap.on('load', async () => {

        // --- Start Marker ---
        if (start) {
            const el = document.createElement('div');
            el.style.cssText = 'width:20px;height:20px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:pointer;';
            new mapboxgl.Marker({ element: el })
                .setLngLat([start.lng, start.lat])
                .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML('<strong>🟢 Trip Started</strong>'))
                .addTo(fleetMap)
                .togglePopup();
            getPlaceName(start.lat, start.lng).then(name => {
                document.getElementById('map-start-text').innerText = name;
            });
        } else {
            document.getElementById('map-start-text').innerText = 'No start GPS recorded';
        }

        // --- End Marker ---
        if (end) {
            const el = document.createElement('div');
            el.style.cssText = 'width:20px;height:20px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:pointer;';
            new mapboxgl.Marker({ element: el })
                .setLngLat([end.lng, end.lat])
                .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML('<strong>🔴 Trip Ended</strong>'))
                .addTo(fleetMap);
            getPlaceName(end.lat, end.lng).then(name => {
                document.getElementById('map-end-text').innerText = name;
            });
        } else {
            document.getElementById('map-end-text').innerText = '⏳ Trip in progress — end location pending';
        }

        // --- Draw Route if both points exist ---
        if (start && end) {
            try {
                const routeRes = await fetch(
                    `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
                );
                const routeData = await routeRes.json();
                if (routeData.routes && routeData.routes.length > 0) {
                    const route = routeData.routes[0];
                    const distKm = (route.distance / 1000).toFixed(2);
                    const durationMin = Math.round(route.duration / 60);
                    document.getElementById('map-distance-text').innerText = `${distKm} KM  (≈ ${durationMin} min drive)`;

                    fleetMap.addSource('route', {
                        type: 'geojson',
                        data: { type: 'Feature', properties: {}, geometry: route.geometry }
                    });
                    fleetMap.addLayer({
                        id: 'route',
                        type: 'line',
                        source: 'route',
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                        paint: { 'line-color': '#3b82f6', 'line-width': 6, 'line-opacity': 0.9 }
                    });

                    // Fit map to show full route
                    const coords = route.geometry.coordinates;
                    const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
                    fleetMap.fitBounds(bounds, { padding: 60 });
                } else {
                    document.getElementById('map-distance-text').innerText = 'Route not available';
                    fleetMap.fitBounds([[start.lng, start.lat], [end.lng, end.lat]], { padding: 80 });
                }
            } catch(e) {
                document.getElementById('map-distance-text').innerText = 'Could not load route';
            }
        } else if (start) {
            document.getElementById('map-distance-text').innerText = 'Trip in progress — no end point yet';
        }
    });
};

document.addEventListener("DOMContentLoaded", () => {
    init();
});

