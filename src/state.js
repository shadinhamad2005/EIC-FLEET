// Global State Management
export const state = {
    view: 'login', // 'login', 'vehicles', 'admin', 'active_trip'
    adminTab: 'logbook',
    adminRole: null, // 'super', 'regular'
    currentUser: null,
    drivers: [],
    admins: [],
    vehicles: [],
    logs: [],
    refuels: [],
    broadcasts: [],
    settings: { enableGeotagging: false },
    selectedVehicle: null,
    editingVehicleId: null,
    editingDriverId: null,
    isLoading: true,
    isSyncing: false,
    pendingWrites: 0,
    broadcast: null,
    isOnline: navigator.onLine
};

export const loadedFlags = { 
    drivers: false, 
    admins: false, 
    vehicles: false, 
    logs: false,
    refuels: false,
    broadcasts: false,
    settings: false
};

export const ADMIN_PIN = '8891190911';

// We'll use an event bus approach to re-render UI when state changes
const listeners = new Set();

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function notifyStateChange() {
    listeners.forEach(listener => listener(state));
}

export function updateState(newState) {
    Object.assign(state, newState);
    notifyStateChange();
}
