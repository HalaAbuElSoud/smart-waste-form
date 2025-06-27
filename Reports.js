import React, { useEffect, useState, useRef } from 'react';
import './Reports.css';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db as firestore } from '../firebaseConfig';

// swm-form config for reports
const swmFormConfig = {
  apiKey: "AIzaSyCN0douQFost_MgeTuq0yTAXAL-P3ychwc",
  authDomain: "swm-form.firebaseapp.com",
  databaseURL: "https://swm-form-default-rtdb.firebaseio.com",
  projectId: "swm-form",
  storageBucket: "swm-form.appspot.com",
  messagingSenderId: "14785897186",
  appId: "1:14785897186:web:4e32256d8cf7ab0e2eb4bb",
  measurementId: "G-3R8K7HY0QT"
};
const swmFormApp = initializeApp(swmFormConfig, 'swmFormReports');
const swmFormDb = getDatabase(swmFormApp);

// Helper to check if driver is active based on work hours (copied from DriverManagement.js)
function isDriverActive(workHours) {
  if (!workHours) return false;
  const now = new Date();
  const [start, end] = workHours.split('-');
  if (!start || !end) return false;
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startDate = new Date(now);
  startDate.setHours(startH, startM, 0, 0);
  const endDate = new Date(now);
  endDate.setHours(endH, endM, 0, 0);
  if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);
  return now >= startDate && now <= endDate;
}

// Helper to log frontend actions to a file (for debugging in development)
function logFrontend(msg) {
  try {
    fetch('http://localhost:3001/frontend_log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg, timestamp: new Date().toISOString() })
    });
    // Also log to a local file for persistent logging (if running in Node.js/Electron)
    if (typeof window === 'undefined' && typeof require === 'function') {
      const fs = require('fs');
      fs.appendFileSync('frontend_log.txt', `[${new Date().toISOString()}] ${msg}\n`);
    }
  } catch (e) {
    // Ignore logging errors
  }
}

function Reports() {
  const [reports, setReports] = useState([]);
  const [popupImg, setPopupImg] = useState(null);
  const [newReportTimestamps, setNewReportTimestamps] = useState([]);
  const [recentReportTimestamps, setRecentReportTimestamps] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [assigningReport, setAssigningReport] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [sortByDate, setSortByDate] = useState('desc'); // default to newest
  const prevTimestampsRef = useRef([]);
  const [confirmAssign, setConfirmAssign] = useState(false); // for confirmation modal
  const [selectedDriver, setSelectedDriver] = useState(null); // store selected driver object

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [reportsPerPage, setReportsPerPage] = useState(10);
  
  // Enhanced filtering state
  const [filters, setFilters] = useState({
    severity: '',
    status: '',
    dateFrom: '',
    dateTo: '',
    binId: '',
    assignmentStatus: '' // 'assigned', 'unassigned', ''
  });

  // Applied filters state (for manual apply)
  const [appliedFilters, setAppliedFilters] = useState({
    severity: '',
    status: '',
    dateFrom: '',
    dateTo: '',
    binId: '',
    assignmentStatus: ''
  });

  // Loading state
  const [loading, setLoading] = useState(true);

  // Helper to get and set seen reports in localStorage
  const getSeenReports = () => {
    try {
      return JSON.parse(localStorage.getItem('seenReportTimestamps') || '[]');
    } catch {
      return [];
    }
  };
  const setSeenReports = (timestamps) => {
    localStorage.setItem('seenReportTimestamps', JSON.stringify(timestamps));
  };

  useEffect(() => {
    setLoading(true);
    // Use swm-form database for reports
    const reportsRef = ref(swmFormDb, 'reports');
    const unsubscribe = onValue(reportsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setReports([]);
        setNewReportTimestamps([]);
        setRecentReportTimestamps([]);
        prevTimestampsRef.current = [];
        setSeenReports([]);
        setLoading(false);
        return;
      }
      // Attach the Firebase key to each report for easy updates
      const newReportsArr = Object.entries(data)
        .map(([key, value]) => ({ ...value, _key: key }))
        .reverse();
      setReports(newReportsArr);
      
      // Find new timestamps not in seen list
      const seenTimestamps = getSeenReports();
      const currentTimestamps = newReportsArr.map(r => r.timestamp);
      const unseenTimestamps = currentTimestamps.filter(ts => !seenTimestamps.includes(ts));
      
      console.log('Reports data loaded:', {
        totalReports: newReportsArr.length,
        seenTimestamps: seenTimestamps.length,
        seenList: seenTimestamps,
        currentTimestamps: currentTimestamps,
        unseenTimestamps: unseenTimestamps.length,
        unseenList: unseenTimestamps
      });
      
      // Find recent reports (added within last 5 minutes) that haven't been seen yet
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const recentTimestamps = currentTimestamps.filter(ts => {
        const reportDate = new Date(ts);
        return reportDate >= fiveMinutesAgo && !seenTimestamps.includes(ts);
      });
      
      // Check if this is truly new data (different from previous) or initial load
      const isInitialLoad = prevTimestampsRef.current.length === 0;
      const hasNewData = JSON.stringify(currentTimestamps) !== JSON.stringify(prevTimestampsRef.current);
      
      console.log('Load type:', { isInitialLoad, hasNewData });
      
      // Always set timestamps for unseen reports, regardless of load type
      if (unseenTimestamps.length > 0) {
        console.log('Setting new report timestamps:', unseenTimestamps);
        setNewReportTimestamps(unseenTimestamps);
        
        // For real-time new data (not initial load), auto-clear after 15 seconds
        if (!isInitialLoad && hasNewData) {
          console.log('Setting 15-second auto-clear timer for new data');
          setTimeout(() => {
            console.log('Auto-clearing new reports after 15 seconds');
            // Only mark the new unseen reports as seen, not all reports
            const previousSeen = getSeenReports();
            const allSeen = [...new Set([...previousSeen, ...unseenTimestamps])];
            setSeenReports(allSeen);
            setNewReportTimestamps([]);
          }, 15000);
        }
      } else {
        console.log('No unseen reports found');
        setNewReportTimestamps([]);
      }
      
      // Set recent reports for gentler highlighting
      console.log('Setting recent report timestamps:', recentTimestamps);
      setRecentReportTimestamps(recentTimestamps);
      
      prevTimestampsRef.current = currentTimestamps;
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Clear highlights after 30 seconds and mark unseen reports as seen
  useEffect(() => {
    if (newReportTimestamps.length === 0) return; // No new reports to highlight
    
    console.log('Setting up 30-second timer for highlights:', newReportTimestamps);
    const timer = setTimeout(() => {
      console.log('30-second timer triggered - clearing highlights and marking as seen');
      
      // Mark only the currently highlighted new reports as seen
      const previousSeen = getSeenReports();
      const allSeen = [...new Set([...previousSeen, ...newReportTimestamps])];
      setSeenReports(allSeen);
      console.log('Marked as seen:', newReportTimestamps.length, 'new reports');
      console.log('Total seen reports now:', allSeen.length);
      
      // Clear all highlights
      setNewReportTimestamps([]);
      setRecentReportTimestamps([]);
      console.log('Cleared all highlights after 30 seconds');
    }, 30000);

    return () => {
      console.log('Cleaning up 30-second timer');
      clearTimeout(timer);
    };
  }, [newReportTimestamps]); // Depend on newReportTimestamps so timer resets when they change

  // Clear recent highlights when reports are marked as seen
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'seenReportTimestamps') {
        // When seen reports are updated, clear recent highlights
        setRecentReportTimestamps([]);
      }
    };

    const handleReportsMarkedAsSeen = () => {
      console.log('Reports marked as seen event received - clearing highlights');
      // Clear both new and recent highlights when reports are marked as seen
      setNewReportTimestamps([]);
      setRecentReportTimestamps([]);
    };

    const handleNavigatedToReports = () => {
      // User navigated to reports page - don't clear highlights immediately
      // Let the natural timers handle it
      console.log('User navigated to Reports page via sidebar');
    };

    // Listen for storage changes from other tabs
    window.addEventListener('storage', handleStorageChange);
    // Listen for custom event from same tab (sidebar)
    window.addEventListener('reportsMarkedAsSeen', handleReportsMarkedAsSeen);
    window.addEventListener('navigatedToReports', handleNavigatedToReports);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('reportsMarkedAsSeen', handleReportsMarkedAsSeen);
      window.removeEventListener('navigatedToReports', handleNavigatedToReports);
    };
  }, []);

  // Remove the separate useEffect for highlight timing since we handle it in the data loading useEffect

  const handleToggleStatus = (report, idx) => {
    if (!report._key) return;
    const reportRef = ref(swmFormDb, `reports/${report._key}`);
    const newStatus = report.status === 'resolved' ? 'not_resolved' : 'resolved';
    import('firebase/database').then(({ update }) => {
      update(reportRef, { status: newStatus });
    });
  };

  // Fetch all drivers from truck_drivers, filter for active in UI
  const fetchActiveDrivers = async () => {
    const q = collection(firestore, 'truck_drivers');
    const querySnapshot = await getDocs(q);
    setDrivers(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  const handleAssignInspection = (report) => {
    setAssigningReport(report);
    setShowAssignModal(true);
    fetchActiveDrivers();
    setSelectedDriver(null);
    setAssigning(false); // Reset assigning state so the button is enabled every time
  };

  const handleAssignDriverClick = (driver) => {
    setSelectedDriver(driver);
  };

  const handleAssignDriver = async () => {
    if (!assigningReport || !selectedDriver) return;
    setAssigning(true);
    setShowAssignModal(false); // Ensure modal closes immediately after assignment
    try {
      // Check if bin exists in Firestore (by bin_id field, ensure type match)
      const binsCol = collection(firestore, 'waste_bins');
      // bin_id in Firestore may be stored as string or number, so check both
      const binIdStr = String(assigningReport.binId);
      const binIdNum = Number(assigningReport.binId);
      const q1 = query(binsCol, where('bin_id', '==', binIdStr));
      const q2 = query(binsCol, where('bin_id', '==', binIdNum));
      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      if (snap1.empty && snap2.empty) {
        alert('Error: Bin with this ID does not exist in the database.');
        setAssigning(false);
        return;
      }
      let foundDoc = null;
      if (!snap1.empty) {
        foundDoc = snap1.docs[0];
      } else if (!snap2.empty) {
        foundDoc = snap2.docs[0];
      }
      let googleMapsUrl = '';
      if (foundDoc) {
        const loc = foundDoc.data().location;
        if (loc && loc.lat && loc.lng) {
          googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
        }
      }
      // Validate WhatsApp message fields before sending
      const driverPhone = selectedDriver?.phone;
      // Validate WhatsApp message fields before sending
      if (!driverPhone) {
        alert('Cannot send WhatsApp: Missing driver phone number.');
        logFrontend('WhatsApp send skipped: Missing driver phone number.');
      } else if (!googleMapsUrl) {
        alert('Cannot send WhatsApp: Missing bin location.');
        logFrontend('WhatsApp send skipped: Missing bin location.');
      } else {
        const assignMsg = `You have been assigned to inspecting this bin: ${googleMapsUrl}`;
        logFrontend('Sending WhatsApp: ' + JSON.stringify({ to: driverPhone, message: assignMsg }));
        try {
          const response = await fetch('http://localhost:3001/send_whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: driverPhone,
              message: assignMsg
            })
          });
          const data = await response.json();
          if (!data.success) {
            logFrontend('WhatsApp send failed: ' + JSON.stringify(data));
            alert('Failed to send WhatsApp message: ' + (data.error || 'Unknown error'));
          } else {
            logFrontend('WhatsApp send success: ' + JSON.stringify(data));
          }
        } catch (err) {
          logFrontend('WhatsApp send error: ' + err.message);
          alert('Failed to send WhatsApp message: ' + err.message);
        }
      }
      // Debug: Log selectedDriver at assignment time
      logFrontend('Assigning driver object: ' + JSON.stringify(selectedDriver));
      logFrontend('Before importing firebase/database for update');
      // FIX: Define reportRef and driverName here
      const reportRef = ref(swmFormDb, `reports/${assigningReport._key}`);
      const driverName = selectedDriver.name;
      try {
        await import('firebase/database').then(({ update }) => {
          logFrontend('After importing firebase/database, before update() call');
          return update(reportRef, { assignedDriver: selectedDriver.id, assignedTo: driverName })
            .then(() => logFrontend('Realtime DB update success for assignedTo: ' + driverName))
            .catch(err => logFrontend('Realtime DB update FAILED: ' + (err && err.message ? err.message : JSON.stringify(err))));
        });
        logFrontend('After update() call, before closing modal');
      } catch (err) {
        logFrontend('CATCH block: ' + (err && err.message ? err.message : JSON.stringify(err)));
      }
      // Also update local state to reflect assignment
      setReports(prevReports => prevReports.map(r =>
        r._key === assigningReport._key
          ? { ...r, assignedDriver: selectedDriver.id, assignedTo: driverName }
          : r
      ));
      setShowAssignModal(false);
      setAssigningReport(null);
      setSelectedDriver(null);
    } catch (e) {
      alert('Failed to assign driver.');
    }
    setAssigning(false);
  };

  const handleCloseModal = () => {
    setShowAssignModal(false);
    setAssigningReport(null);
    setSelectedDriver(null);
    setConfirmAssign(false);
  };

  // Filter and sort reports
  const filteredAndSortedReports = React.useMemo(() => {
    let result = [...reports];
    
    // Apply filters using appliedFilters instead of filters
    if (appliedFilters.severity) {
      result = result.filter(report => report.severity === appliedFilters.severity);
    }
    
    if (appliedFilters.status) {
      result = result.filter(report => report.status === appliedFilters.status);
    }
    
    if (appliedFilters.binId) {
      result = result.filter(report => String(report.binId).includes(appliedFilters.binId));
    }
    
    if (appliedFilters.assignmentStatus) {
      if (appliedFilters.assignmentStatus === 'assigned') {
        result = result.filter(report => report.assignedDriver);
      } else if (appliedFilters.assignmentStatus === 'unassigned') {
        result = result.filter(report => !report.assignedDriver);
      }
    }
    
    if (appliedFilters.dateFrom) {
      const fromDate = new Date(appliedFilters.dateFrom);
      result = result.filter(report => new Date(report.timestamp) >= fromDate);
    }
    
    if (appliedFilters.dateTo) {
      const toDate = new Date(appliedFilters.dateTo);
      toDate.setHours(23, 59, 59); // Include the entire day
      result = result.filter(report => new Date(report.timestamp) <= toDate);
    }

    // Apply date sorting
    result.sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return sortByDate === 'asc' ? aTime - bTime : bTime - aTime;
    });
    
    return result;
  }, [reports, appliedFilters, sortByDate]);

  // Pagination logic
  const totalPages = Math.ceil(filteredAndSortedReports.length / reportsPerPage);
  const startIndex = (currentPage - 1) * reportsPerPage;
  const endIndex = startIndex + reportsPerPage;
  const currentReports = filteredAndSortedReports.slice(startIndex, endIndex);

  // Reset to page 1 when applied filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [appliedFilters, sortByDate]);

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  const clearFilters = () => {
    const clearedFilters = {
      severity: '',
      status: '',
      dateFrom: '',
      dateTo: '',
      binId: '',
      assignmentStatus: ''
    };
    setFilters(clearedFilters);
    setAppliedFilters(clearedFilters);
    setSortByDate('desc');
  };

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
    setCurrentPage(1); // Reset to first page when applying filters
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    // Scroll to top when changing pages
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  return (
    <div className="reports-root">
      <div className="reports-content">
        {/* Enhanced Filters Section */}
        <div className="filters-section" style={{ 
          background: '#f8f9fa', 
          padding: '20px', 
          borderRadius: '8px', 
          marginBottom: '20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#2c3e50' }}>Filter Reports</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={applyFilters}
                style={{ 
                  background: '#27ae60', 
                  color: 'white', 
                  border: 'none', 
                  padding: '8px 16px', 
                  borderRadius: '4px', 
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Apply Filters
              </button>
              <button 
                onClick={clearFilters}
                style={{ 
                  background: '#e74c3c', 
                  color: 'white', 
                  border: 'none', 
                  padding: '8px 16px', 
                  borderRadius: '4px', 
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Clear All Filters
              </button>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            {/* Bin ID */}
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#2c3e50' }}>
                Bin ID
              </label>
              <input
                type="text"
                placeholder="Filter by Bin ID"
                value={filters.binId}
                onChange={(e) => handleFilterChange('binId', e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>

            {/* Severity */}
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#2c3e50' }}>
                Severity
              </label>
              <select
                value={filters.severity}
                onChange={(e) => handleFilterChange('severity', e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="">All Severities</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#2c3e50' }}>
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="">All Statuses</option>
                <option value="resolved">Resolved</option>
                <option value="not_resolved">Not Resolved</option>
              </select>
            </div>

            {/* Assignment Status */}
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#2c3e50' }}>
                Assignment
              </label>
              <select
                value={filters.assignmentStatus}
                onChange={(e) => handleFilterChange('assignmentStatus', e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="">All Reports</option>
                <option value="assigned">Assigned to Driver</option>
                <option value="unassigned">Not Assigned</option>
              </select>
            </div>

            {/* Date From */}
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#2c3e50' }}>
                From Date
              </label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>

            {/* Date To */}
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#2c3e50' }}>
                To Date
              </label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>
        </div>

        {/* Results Summary */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px',
          padding: '15px',
          background: '#e8f4fd',
          borderRadius: '8px',
          border: '1px solid #bee5eb'
        }}>
          <div>
            <strong>
              Showing {currentReports.length} of {filteredAndSortedReports.length} reports
              {filteredAndSortedReports.length !== reports.length && ` (filtered from ${reports.length} total)`}
            </strong>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label style={{ fontWeight: '600', color: '#2c3e50' }}>Reports per page:</label>
            <select
              value={reportsPerPage}
              onChange={(e) => {
                setReportsPerPage(Number(e.target.value));
                setCurrentPage(1); // Reset to first page when changing page size
              }}
              style={{ 
                padding: '5px', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                fontSize: '14px'
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
        {/* Sort Buttons */}
        <div style={{ display: 'flex', gap: 15, margin: '20px 0 25px 0', flexWrap: 'wrap' }}>
          <button
            className="sort-btn"
            onClick={() => setSortByDate(sortByDate === 'desc' ? 'asc' : 'desc')}
            style={{ 
              background: sortByDate ? '#e1bee7' : '#f7f7f7', 
              border: '1px solid #ce93d8', 
              borderRadius: 8, 
              padding: '8px 16px', 
              cursor: 'pointer', 
              fontSize: '14px' 
            }}
          >
            Sort by Date {sortByDate === 'desc' ? '(Newest First)' : '(Oldest First)'}
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px', 
            fontSize: '18px', 
            color: '#7f8c8d' 
          }}>
            Loading reports...
          </div>
        )}

        {/* Reports Display */}
        <div id="reportsContainer">
          {!loading && currentReports.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px', 
              fontSize: '18px', 
              color: '#7f8c8d',
              background: '#f8f9fa',
              borderRadius: '8px',
              border: '2px dashed #dee2e6'
            }}>
              {filteredAndSortedReports.length === 0 ? 
                (reports.length === 0 ? 'No reports yet.' : 'No reports match your filters.') :
                'No reports on this page.'
              }
            </div>
          ) : (
            // Group reports into pairs for two per row
            currentReports.reduce((rows, report, idx) => {
              if (idx % 2 === 0) rows.push([report]);
              else rows[rows.length - 1].push(report);
              return rows;
            }, []).map((row, rowIdx) => (
              <div key={rowIdx} style={{ display: 'flex', gap: 30, marginBottom: 30 }}>
                {row.map((report, idx) => {
                  // Determine highlight class - new reports take precedence over recent
                  let highlightClass = '';
                  if (newReportTimestamps.includes(report.timestamp)) {
                    highlightClass = ' new-report-highlight';
                  } else if (recentReportTimestamps.includes(report.timestamp)) {
                    highlightClass = ' recent-report-highlight';
                  }
                  
                  return (
                    <div
                      className={`report${highlightClass}`}
                      key={report._key || idx}
                      style={{ flex: 1, position: 'relative' }}
                    >
                    {/* Status badge positioned at top-right corner */}
                    <span 
                      className={`bin-status ${report.status === 'resolved' ? 'resolved' : 'not-resolved'}`}
                      style={{ 
                        position: 'absolute', 
                        top: '10px', 
                        right: '10px', 
                        zIndex: 3 
                      }}
                    >
                      {report.status === 'resolved' ? 'Resolved' : 'Not Resolved'}
                    </span>
                    
                    <div className="report-content">
                      <div className="report-details-with-status">
                        <p><strong>Bin ID:</strong> {report.binId}</p>
                        <p><strong>Issue:</strong> {report.issue}</p>
                        {report.issue === 'Other' && (
                          <p><strong>Details:</strong> {report.otherDetails}</p>
                        )}
                        <p><strong>Severity:</strong> {report.severity}</p>
                        <p><strong>Comments:</strong> {report.comments}</p>
                        <p><small>{new Date(report.timestamp).toLocaleString()}</small></p>
                        {report.assignedDriver && (
                          <p><strong>Assigned Driver:</strong> {drivers.find(d => d.id === report.assignedDriver)?.name || report.assignedDriver}</p>
                        )}
                      </div>
                      <div className="report-actions-row">
                        <button
                          className="status-toggle-btn"
                          onClick={() => handleToggleStatus(report, idx)}
                        >
                          Mark as {report.status === 'resolved' ? 'Not Resolved' : 'Resolved'}
                        </button>
                        <button
                          className="assign-inspection-btn"
                          onClick={() => handleAssignInspection(report)}
                          disabled={report.status === 'resolved'}
                          style={{
                            opacity: report.status === 'resolved' ? 0.5 : 1,
                            cursor: report.status === 'resolved' ? 'not-allowed' : 'pointer'
                          }}
                        >
                          Take Action / Assign Inspection
                        </button>
                        {report.assignedTo && (
                          <div style={{ color: '#4caf50', fontWeight: 600, marginTop: 8 }}>
                            Bin assigned to {report.assignedTo}
                          </div>
                        )}
                      </div>
                    </div>
                    {report.imageBase64 && (
                      <img
                        className="report-img"
                        src={report.imageBase64}
                        alt="Reported bin issue"
                        onClick={() => setPopupImg(report.imageBase64)}
                      />
                    )}
                  </div>
                  );
                })}
                {/* If only one report in the last row, add an empty div for alignment */}
                {row.length === 1 && <div style={{ flex: 1 }} />}
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {!loading && filteredAndSortedReports.length > 0 && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            gap: '10px', 
            marginTop: '30px',
            padding: '20px',
            background: '#f8f9fa',
            borderRadius: '8px'
          }}>
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              style={{
                padding: '8px 16px',
                background: currentPage === 1 ? '#e9ecef' : '#007bff',
                color: currentPage === 1 ? '#6c757d' : 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontSize: '14px'
              }}
            >
              Previous
            </button>
            
            <div style={{ display: 'flex', gap: '5px' }}>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (currentPage <= 4) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = currentPage - 3 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    style={{
                      padding: '8px 12px',
                      background: currentPage === pageNum ? '#007bff' : '#fff',
                      color: currentPage === pageNum ? 'white' : '#007bff',
                      border: '1px solid #007bff',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      minWidth: '40px'
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              style={{
                padding: '8px 16px',
                background: currentPage === totalPages ? '#e9ecef' : '#007bff',
                color: currentPage === totalPages ? '#6c757d' : 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '14px'
              }}
            >
              Next
            </button>
            
            <span style={{ marginLeft: '20px', color: '#6c757d', fontSize: '14px' }}>
              Page {currentPage} of {totalPages}
            </span>
            
            {/* Quick page jump */}
            {totalPages > 7 && (
              <div style={{ marginLeft: '20px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <label style={{ fontSize: '14px', color: '#6c757d' }}>Go to:</label>
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  placeholder="Page"
                  style={{
                    width: '60px',
                    padding: '4px 8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const page = parseInt(e.target.value);
                      if (page >= 1 && page <= totalPages) {
                        handlePageChange(page);
                        e.target.value = '';
                      }
                    }
                  }}
                />
              </div>
            )}
          </div>
        )}

      {/* Assign Inspection Modal */}
      {showAssignModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Assign Driver for Inspection</h3>
            <button className="modal-close" onClick={handleCloseModal}>&times;</button>
            {drivers.filter(driver => isDriverActive(driver.workHours)).length === 0 ? (
              <p>No active drivers available.</p>
            ) : (
              <>
                <div className="driver-option-list">
                  {drivers.filter(driver => isDriverActive(driver.workHours)).map(driver => (
                    <div
                      key={driver.id}
                      className={`driver-option-item${selectedDriver && selectedDriver.id === driver.id ? ' selected' : ''}`}
                      onClick={() => handleAssignDriverClick(driver)}
                      tabIndex={0}
                      role="button"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 16px', borderRadius: 8, marginBottom: 8, background: selectedDriver && selectedDriver.id === driver.id ? '#e8f5e9' : '#f7f7f7', cursor: 'pointer', border: '1px solid #e0e0e0', transition: 'background 0.2s'
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') handleAssignDriverClick(driver); }}
                    >
                      <span style={{ fontWeight: 600 }}>{driver.name}</span>
                      <span style={{ color: '#888', fontSize: 14 }}>{driver.phone}</span>
                      <span className="driver-status-dot driver-status-active" title="Active" style={{ marginLeft: 8 }} />
                    </div>
                  ))}
                </div>
                <button
                  className="assign-driver-btn"
                  style={{ marginTop: 10, width: '100%' }}
                  disabled={!selectedDriver || assigning}
                  onClick={handleAssignDriver}
                >
                  Assign Driver
                </button>
              </>
            )}
          </div>
        </div>
      )}
        {/* Image Popup */}
        {popupImg && (
          <div className="image-popup-overlay" onClick={() => setPopupImg(null)}>          
            <img className="image-popup-img" src={popupImg} alt="Full size" />
          </div>
        )}
      </div>
    </div>
  );
}

export default Reports;
