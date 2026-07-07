import { state } from '../state.js';
import { t } from '../i18n.js';

function getLangSwitcher() {
    const lang = localStorage.getItem('eic_lang') || 'en';
    return `
        <select onchange="window.switchLanguage(this.value)" style="background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 0.25rem 0.5rem; outline: none; cursor: pointer; height: fit-content; align-self: center;">
            <option value="en" ${lang === 'en' ? 'selected' : ''} style="color: black;">EN</option>
            <option value="ml" ${lang === 'ml' ? 'selected' : ''} style="color: black;">മലയാളം</option>
            <option value="hi" ${lang === 'hi' ? 'selected' : ''} style="color: black;">हिंदी</option>
        </select>
    `;
}

export function renderApp() {
    if (state.isLoading) return;

    let broadcastHtml = '';
    if (state.view !== 'login' && state.view !== 'admin' && state.broadcasts && state.broadcasts.length > 0) {
        const latestBroadcast = [...state.broadcasts].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        const isDismissed = localStorage.getItem(`eic_dismissed_broadcast_${latestBroadcast.id}`);
        if (!isDismissed) {
            broadcastHtml = `
                <div id="global-broadcast-banner" style="background: var(--accent-primary); color: white; padding: 1rem; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: start; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                    <div style="display: flex; gap: 1rem; align-items: start;">
                        <i class="fas fa-bullhorn" style="font-size: 1.5rem; margin-top: 0.2rem;"></i>
                        <div>
                            <div style="font-weight: bold; margin-bottom: 0.25rem;">Fleet Announcement</div>
                            <div style="font-size: 0.9rem; line-height: 1.4;">${latestBroadcast.message}</div>
                        </div>
                    </div>
                    <button onclick="window.dismissBroadcast('${latestBroadcast.id}')" style="background: none; border: none; color: white; cursor: pointer; padding: 0.25rem; font-size: 1.25rem;"><i class="fas fa-times"></i></button>
                </div>
            `;
        }
    }
    const bCont = document.getElementById('broadcast-container');
    if (bCont) bCont.innerHTML = broadcastHtml;

    document.getElementById('view-loader').classList.add('hidden');
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-vehicles').classList.add('hidden');
    document.getElementById('view-active-trip').classList.add('hidden');
    document.getElementById('view-admin').classList.add('hidden');

    const activeView = document.getElementById(`view-${state.view.replace('_', '-')}`);
    if (activeView) {
        activeView.classList.remove('hidden');
        if (state.view === 'login') renderLogin();
        else if (state.view === 'vehicles') renderVehicles();
        else if (state.view === 'active_trip') renderActiveTrip();
        else if (state.view === 'admin') renderAdmin();
    }
}

function renderLogin() {
    const container = document.getElementById('view-login');
    const driversOptions = state.drivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    
    container.innerHTML = `
        <div style="position: absolute; top: 1rem; right: 1rem; z-index: 10;">
            ${getLangSwitcher()}
        </div>
        <div class="glass-panel" style="max-width: 400px; width: 100%; text-align: center;">
            <div style="margin-bottom: 2rem;">
                <div class="avatar" style="margin: 0 auto 1rem auto; width: 64px; height: 64px;">
                    <i class="fas fa-truck" style="font-size: 1.5rem; color: white;"></i>
                </div>
                <h1 class="title-main">${t('fleet_tracker')}</h1>
                <p class="subtitle">${t('driver_access_portal')}</p>
            </div>
            
            <div id="driver-login-form">
                <div class="input-group" style="text-align: left;">
                    <label class="input-label">${t('select_driver')}</label>
                    <select id="driver-select" class="input-field">
                        <option value="">-- ${t('select_driver')} --</option>
                        ${driversOptions}
                    </select>
                </div>
                
                <div class="input-group" style="text-align: left;">
                    <label class="input-label">${t('pin_code')}</label>
                    <input type="password" inputmode="numeric" pattern="[0-9]*" id="login-driver-pin-input" class="input-field" placeholder="••••" maxlength="4" style="text-align: center; font-size: 1.5rem; letter-spacing: 0.5em;">
                </div>
                
                <button onclick="window.handleLogin('driver')" class="btn btn-primary" style="margin-top: 1rem;">
                    <i class="fas fa-sign-in-alt"></i> ${t('login_btn')}
                </button>
            </div>
            
            <div style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border-light);">
                <button onclick="document.getElementById('admin-login-form').classList.toggle('hidden')" class="btn btn-outline" style="font-size: 0.8rem; padding: 0.5rem;">
                    <i class="fas fa-shield-alt"></i> ${t('admin_access')}
                </button>
            </div>
            
            <div id="admin-login-form" class="hidden" style="margin-top: 1rem; text-align: left;">
                <div class="input-group">
                    <label class="input-label">Admin PIN</label>
                    <input type="password" inputmode="numeric" pattern="[0-9]*" id="admin-pin-input" class="input-field" placeholder="Admin PIN">
                </div>
                <button onclick="window.handleLogin('admin')" class="btn btn-outline">Access Dashboard</button>
            </div>
        </div>
    `;
}

function renderVehicles() {
    const container = document.getElementById('view-vehicles');
    
    let html = `
        <div class="header" style="display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; align-items: center; padding-bottom: 1rem;">
            <div>
                <h2 style="font-size: 1.5rem; margin: 0 0 0.2rem 0;">${t('available_vehicles')}</h2>
                <p class="text-muted" style="margin: 0; font-size: 0.9rem;">${t('select_vehicle_start')}</p>
            </div>
            <div class="user-info" style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
                <span style="font-weight: 600; font-size: 1rem;"><i class="fas fa-user-circle" style="color: var(--accent-primary); margin-right: 0.25rem;"></i>${state.currentUser?.name}</span>
                ${getLangSwitcher()}
                <button onclick="window.handleLogout()" class="btn btn-outline" style="padding: 0.5rem; width: 38px; height: 38px; display: flex; justify-content: center; align-items: center; border-color: var(--accent-danger); color: var(--accent-danger);" title="${t('logout')}">
                    <i class="fas fa-power-off"></i>
                </button>
            </div>
        </div>
        <div class="card-grid">
    `;

    state.vehicles.forEach(v => {
        const activeLog = state.logs.find(l => l.vehicleId === v.id && l.endingKm == null);
        const isTaken = !!activeLog;
        const activeDriverName = isTaken ? (state.drivers.find(d => d.id === activeLog.driverId)?.name || 'Unknown') : null;
        
        let statusBadge = isTaken 
            ? `<span class="badge badge-warning">${t('taken_by')} ${activeDriverName}</span>`
            : `<span class="badge badge-success">${t('available')}</span>`;

        let onClickAction = isTaken ? `window.confirmTakeOver('${v.id}', '${activeDriverName.replace(/'/g, "\\'")}')` : `window.openReadyModal('start', '${v.id}')`;

        html += `
            <div class="card" onclick="${onClickAction}" ${isTaken ? 'style="border: 1px solid var(--accent-warning);"' : ''}>
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                    <div>
                        <h3 style="font-size: 1.25rem; margin-bottom: 0.25rem;">${v.makeModel}</h3>
                        <div class="badge badge-neutral">${v.plate || 'Unknown Plate'}</div>
                    </div>
                    ${statusBadge}
                </div>
                <div style="text-align: right; color: var(--accent-primary); font-size: 0.8rem; margin-top: 1rem;">${isTaken ? t('tap_take_over') + ' <i class="fas fa-exchange-alt"></i>' : t('tap_start_trip') + ' <i class="fas fa-arrow-right"></i>'}</div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

function renderActiveTrip() {
    const container = document.getElementById('view-active-trip');
    const vehicle = state.selectedVehicle;
    
    container.innerHTML = `
        <div style="position: absolute; top: 1rem; right: 1rem; z-index: 10;">
            ${getLangSwitcher()}
        </div>
        <div class="glass-panel" style="text-align: center; margin-top: 2rem;">
            <div class="avatar" style="margin: 0 auto 1.5rem auto; width: 80px; height: 80px; background: var(--accent-success);">
                <i class="fas fa-route" style="font-size: 2rem; color: white;"></i>
            </div>
            <h2 class="title-main" style="color: var(--accent-success);">${t('trip_active')}</h2>
            <p class="subtitle" style="margin-bottom: 2rem;">${t('drive_safely')}, ${state.currentUser?.name}</p>
            
            <div class="card" style="margin-bottom: 2rem; text-align: left; background: rgba(0,0,0,0.2);">
                <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">${t('current_vehicle')}</div>
                <div style="font-size: 1.5rem; font-weight: bold;">${vehicle?.makeModel}</div>
                <div class="badge badge-neutral" style="margin-top: 0.5rem;">${vehicle?.plate || 'Unknown Plate'}</div>
            </div>
            
            <div style="display: flex; gap: 1rem;">
                <button onclick="window.openRefuelModal()" class="btn btn-outline" style="flex: 1; padding: 1rem; border-color: var(--accent-success); color: var(--accent-success);">
                    <i class="fas fa-gas-pump" style="display: block; font-size: 1.5rem; margin-bottom: 0.5rem;"></i> ${t('log_refuel')}
                </button>
                <button onclick="window.openReadyModal('stop')" class="btn btn-success" style="flex: 1; font-size: 1.25rem; padding: 1rem;">
                    <i class="fas fa-stop-circle" style="display: block; font-size: 1.5rem; margin-bottom: 0.5rem;"></i> ${t('end_trip')}
                </button>
            </div>
        </div>
    `;
}

function renderAdmin() {
    const container = document.getElementById('view-admin');
    
    // Determine which tab content to render
    let tabContent = '';
    
    if (state.adminTab === 'logbook') {
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
        
        const rows = sortedLogs.map(l => {
            const v = state.vehicles.find(v => v.id === l.vehicleId);
            const d = state.drivers.find(d => d.id === l.driverId);
            
            const startObj = new Date(l.startTime);
            const startStr = startObj.toLocaleDateString() + ' <span class="text-muted" style="font-size:0.85em">' + startObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + '</span>';
            
            let endStr = '<span class="text-muted">In Progress</span>';
            if (l.endTime) {
                const endObj = new Date(l.endTime);
                endStr = endObj.toLocaleDateString() + ' <span class="text-muted" style="font-size:0.85em">' + endObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + '</span>';
            }
            
            let startLocationHtml = '';
            let endLocationHtml = '';
            
            return `
                <tr class="table-row">
                    <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light);">
                        <div style="font-size: 0.85rem; margin-bottom: 0.25rem; display: flex; align-items: center;"><strong>Start:</strong>&nbsp;${startStr}${startLocationHtml}</div>
                        <div style="font-size: 0.85rem; display: flex; align-items: center;"><strong>End:</strong>&nbsp;${endStr}${endLocationHtml}</div>
                    </td>
                    <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light);"><strong>${v?.makeModel || 'Unknown'}</strong><br><span class="text-muted" style="font-size:0.8em">${v?.plate || ''}</span></td>
                    <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light);">${d?.name || 'Unknown'}</td>
                    <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light); white-space: nowrap;">${l.startingKm} - ${l.endingKm || 'Active'}</td>
                    <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light);">
                        ${(l.status === 'Open' || !l.endingKm) 
                            ? `<div style="display: flex; align-items: center; gap: 0.5rem;"><span class="badge badge-warning" style="white-space: nowrap;">Active</span><button onclick="window.adminForceCloseTrip('${l.id}', '${v?.id}')" class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; color: var(--accent-danger); border-color: var(--accent-danger); width: auto; white-space: nowrap;">Force Close</button></div>` 
                            : '<span class="badge badge-success">Closed</span>'}
                    </td>
                    <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light); white-space: nowrap;" class="no-print">
                        <button class="btn btn-outline" style="padding: 0; width: 32px; height: 32px; font-size: 0.8rem; margin-right: 0.5rem; display: inline-flex; justify-content: center; align-items: center;" onclick="window.openEditTripModal('${l.id}')" title="Edit Trip"><i class="fas fa-edit"></i></button>
                        ${(l.status === 'Open' || !l.endingKm)
                            ? `<button class="btn btn-outline" style="padding:0;width:32px;height:32px;font-size:0.8rem;opacity:0.4;cursor:not-allowed;display:inline-flex;justify-content:center;align-items:center;" disabled title="Cannot delete active trip"><i class="fas fa-trash"></i></button>`
                            : `<button class="btn btn-outline" style="padding:0;width:32px;height:32px;font-size:0.8rem;color:var(--accent-danger);border-color:var(--accent-danger);display:inline-flex;justify-content:center;align-items:center;" onclick="window.deleteTrip('${l.id}')" title="Delete Trip"><i class="fas fa-trash"></i></button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');
        
        tabContent = `
            <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; align-items: flex-end; flex-wrap: wrap; background: rgba(15, 23, 42, 0.4); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-light);">
                <div class="input-group" style="margin-bottom: 0; min-width: 200px; flex: 1;">
                    <label class="input-label" style="font-size: 0.75rem;"><i class="fas fa-calendar-alt"></i> Start Date</label>
                    <input type="date" class="input-field" value="${state.tripFilterStart || ''}" onchange="window.setTripFilter('start', this.value)">
                </div>
                <div class="input-group" style="margin-bottom: 0; min-width: 200px; flex: 1;">
                    <label class="input-label" style="font-size: 0.75rem;"><i class="fas fa-calendar-alt"></i> End Date</label>
                    <input type="date" class="input-field" value="${state.tripFilterEnd || ''}" onchange="window.setTripFilter('end', this.value)">
                </div>
                <button class="btn btn-outline" style="height: 52px; width: auto; padding: 0 1.5rem; white-space: nowrap;" onclick="window.clearTripFilter()"><i class="fas fa-times"></i> Clear Filters</button>
                <div style="flex: 1; min-width: 20px;"></div>
                <button class="btn btn-primary" style="height: 52px; width: auto; padding: 0 2rem; white-space: nowrap; font-size: 1.1rem;" onclick="window.exportTripLogsPDF()"><i class="fas fa-file-pdf"></i> Export PDF Report</button>
            </div>
            <div id="trips-table-container" style="overflow-x: auto; background: var(--bg-card); border-radius: 8px; border: 1px solid var(--border-light);">
                <h2 id="pdf-report-title" style="display: none; color: #000; text-align: center; margin-bottom: 1rem; padding-top: 1rem;">Fleet Trip Logs Report</h2>
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="background: rgba(0,0,0,0.2);">
                            <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary);">Date & Time</th>
                            <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary);">Vehicle</th>
                            <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary);">Driver</th>
                            <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary);">Odometer</th>
                            <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary);">Status</th>
                            <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary);" class="no-print">Actions</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                <div style="text-align: center; padding: 1rem; border-top: 1px solid var(--border-light);">
                    <button class="btn btn-outline" style="width: auto; padding: 0.5rem 2rem; font-size: 0.85rem;" onclick="window.loadMoreLogs()">Load More Historical Trips</button>
                </div>
            </div>
        `;
    } else if (state.adminTab === 'vehicles') {
        const rows = state.vehicles.map(v => {
            const vRefuels = state.refuels.filter(r => r.vehicleId === v.id).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
            const lastFullLog = vRefuels.find(r => r.isFullTank === true);
            
            // Calculate absolute current KM for the vehicle
            let currentKm = 0;
            const allLogs = state.logs.filter(l => l.vehicleId === v.id && l.endingKm != null);
            const maxLogKm = allLogs.length > 0 ? Math.max(...allLogs.map(l => Number(l.endingKm))) : 0;
            const maxRefuelKm = vRefuels.length > 0 ? Math.max(...vRefuels.map(r => Number(r.odometer))) : 0;
            currentKm = Math.max(maxLogKm, maxRefuelKm);

            let distanceSinceFull = '<span class="text-muted">Unknown</span>';
            if (lastFullLog) {
                const dist = currentKm - Number(lastFullLog.odometer);
                distanceSinceFull = `<span style="color: var(--accent-success); font-weight: bold;">${dist} KM</span>`;
            }

            // Maintenance calculation
            const lastService = v.lastServiceKm || 0;
            const interval = v.serviceIntervalKm || 10000;
            const distSinceService = currentKm - lastService;
            const remaining = interval - distSinceService;

            let maintBadge = '';
            if (currentKm === 0 && lastService === 0) {
                maintBadge = `<span class="badge badge-neutral">No Data</span>`;
            } else if (remaining < 0) {
                maintBadge = `<span class="badge badge-warning" style="background: rgba(239, 68, 68, 0.1); color: var(--accent-danger); border: 1px solid var(--accent-danger);">Overdue (${Math.abs(remaining)} KM)</span>`;
            } else if (remaining <= 500) {
                maintBadge = `<span class="badge badge-warning">Due Soon (${remaining} KM left)</span>`;
            } else {
                maintBadge = `<span class="badge badge-success">Healthy (${remaining} KM left)</span>`;
            }
            const activeLog = state.logs.find(l => l.vehicleId === v.id && l.endingKm == null);
            const isTaken = !!activeLog;
            const currentDriverName = isTaken ? (state.drivers.find(d => d.id === activeLog.driverId)?.name || 'Unknown') : null;
            const defaultDriverName = v.assignedDriverId ? (state.drivers.find(d => d.id === v.assignedDriverId)?.name || 'Unknown') : 'None';
            
            return `
            <tr>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light);">
                    <strong>${v.makeModel}</strong><br>
                    <span style="font-size: 0.75rem; color: var(--text-muted);"><i class="fas fa-user-tag" style="margin-right:0.25rem;"></i>Default: ${defaultDriverName}</span>
                </td>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light);">${v.plate || 'Unknown'}</td>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light);">${distanceSinceFull}</td>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light);">${maintBadge}</td>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light);">
                    ${isTaken ? `<span class="badge badge-warning">In Use by ${currentDriverName}</span>` : '<span class="badge badge-success">Available</span>'}
                </td>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light); width: 1%; white-space: nowrap;">
                    <button class="btn btn-outline" style="padding: 0; width: 32px; height: 32px; font-size: 0.8rem; color: var(--accent-success); border-color: var(--accent-success); margin-right: 0.5rem; display: inline-flex; justify-content: center; align-items: center;" onclick="window.logVehicleService('${v.id}')" title="Log Service"><i class="fas fa-wrench"></i></button>
                    <button class="btn btn-outline" style="padding: 0; width: 32px; height: 32px; font-size: 0.8rem; display: inline-flex; justify-content: center; align-items: center;" onclick="window.openVehicleModal('${v.id}')" title="Edit Vehicle"><i class="fas fa-edit"></i></button>
                </td>
            </tr>
            `;
        }).join('');
        
        tabContent = `
            <div style="margin-bottom: 1rem; display: flex; justify-content: flex-end; padding: 1rem;">
                <button class="btn btn-primary" style="width: auto;" onclick="window.openVehicleModal()"><i class="fas fa-plus"></i> Add Vehicle</button>
            </div>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="background: rgba(0,0,0,0.2);">
                            <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary);">Make & Model</th>
                            <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary);">License Plate</th>
                            <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary);">Dist. Since Full Tank</th>
                            <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary);">Maintenance Status</th>
                            <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary);">Trip Status</th>
                            <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary);"></th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } else if (state.adminTab === 'drivers') {
        const rows = state.drivers.map(d => {
            const pinDisplay = d.pin 
                ? `<span id="pin-${d.id}" data-pin="${d.pin}" style="font-family: monospace; letter-spacing: 0.2em;">••••</span>
                   <button onclick="window.togglePin('${d.id}')" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; margin-left:1rem; outline:none;" title="Show/Hide PIN">
                       <i id="pin-icon-${d.id}" class="fas fa-eye"></i>
                   </button>` 
                : '<span class="text-muted">No PIN</span>';
                
            return `
            <tr>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light);"><strong>${d.name}</strong></td>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; justify-content: space-between;">
                    <div>${pinDisplay}</div>
                    <button class="btn btn-outline" style="padding: 0; width: 32px; height: 32px; font-size: 0.8rem; margin-left: 1rem; display: inline-flex; justify-content: center; align-items: center;" onclick="window.openDriverModal('${d.id}')" title="Edit Driver"><i class="fas fa-edit"></i></button>
                </td>
            </tr>
            `;
        }).join('');
        
        tabContent = `
            <div style="margin-bottom: 1rem; display: flex; justify-content: flex-end; padding: 1rem;">
                <button class="btn btn-primary" style="width: auto;" onclick="window.openDriverModal()"><i class="fas fa-plus"></i> Add Driver</button>
            </div>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="background: rgba(0,0,0,0.2);">
                            <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary);">Driver Name</th>
                            <th style="padding: 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary);">PIN Access & Actions</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } else if (state.adminTab === 'settings') {
        tabContent = `
            <div style="padding: 2rem;">
                <h3 style="margin-bottom: 1.5rem; color: var(--text-primary); border-bottom: 1px solid var(--border-light); padding-bottom: 0.5rem;">Global Settings</h3>
                
                <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-light); margin-bottom: 1.5rem;">
                    <div>
                        <h4 style="margin: 0 0 0.5rem 0; font-size: 1.1rem;"><i class="fas fa-map-marker-alt" style="color: var(--accent-primary); margin-right: 0.5rem;"></i> GPS Geotagging</h4>
                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">Automatically request and capture driver coordinates when starting or ending a trip. Requires PWA or browser permissions.</p>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="geotag-toggle" ${state.settings?.enableGeotagging ? 'checked' : ''} onchange="window.toggleSetting('enableGeotagging', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="header" style="display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <div>
                <h2 style="font-size: 1.5rem; margin: 0 0 0.2rem 0;"><i class="fas fa-shield-alt text-primary"></i> Admin Dashboard</h2>
                <p class="text-muted" style="margin: 0; font-size: 0.9rem;">Manage fleet, drivers, and view logs</p>
            </div>
            <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
                <span class="badge badge-warning" style="text-transform: capitalize;">Role: ${state.adminRole}</span>
                <button onclick="window.sendBroadcast()" class="btn btn-primary" style="padding: 0.5rem 1rem; width: auto;"><i class="fas fa-bullhorn"></i> Broadcast</button>
                <button onclick="window.handleLogout()" class="btn btn-outline" style="padding: 0.5rem; width: 38px; height: 38px; display: flex; justify-content: center; align-items: center; border-color: var(--accent-danger); color: var(--accent-danger);" title="Logout">
                    <i class="fas fa-power-off"></i>
                </button>
            </div>
        </div>
        
        <div class="glass-panel" style="padding: 0; overflow: hidden;">
            <div style="display: flex; border-bottom: 1px solid var(--border-light); background: rgba(0,0,0,0.1);">
                <button class="btn ${state.adminTab === 'logbook' ? 'btn-primary' : 'btn-outline'}" style="width: 25%; border-radius: 0; border: none; border-right: 1px solid var(--border-light);" onclick="window.switchAdminTab('logbook')">Logbook</button>
                <button class="btn ${state.adminTab === 'vehicles' ? 'btn-primary' : 'btn-outline'}" style="width: 25%; border-radius: 0; border: none; border-right: 1px solid var(--border-light);" onclick="window.switchAdminTab('vehicles')">Vehicles</button>
                <button class="btn ${state.adminTab === 'drivers' ? 'btn-primary' : 'btn-outline'}" style="width: 25%; border-radius: 0; border: none; border-right: 1px solid var(--border-light);" onclick="window.switchAdminTab('drivers')">Drivers</button>
                <button class="btn ${state.adminTab === 'settings' ? 'btn-primary' : 'btn-outline'}" style="width: 25%; border-radius: 0; border: none;" onclick="window.switchAdminTab('settings')">Settings</button>
            </div>
            <div style="padding: 0;">
                ${tabContent}
            </div>
        </div>
    `;
}
