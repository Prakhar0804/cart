import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import './HardwareStatus.css';

const HardwareStatus = ({ cartId }) => {
    const [hardwareStatus, setHardwareStatus] = useState({
        isOnline: false,
        connectionType: null, // 'wifi' or 'gsm'
        signalStrength: null,
        batteryLevel: null,
        lastSeen: null
    });

    useEffect(() => {
        if (!cartId) return;

        // Listen to hardware status updates from ESP32
        const hardwareRef = doc(db, 'cartHardware', cartId);
        const unsubscribe = onSnapshot(hardwareRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setHardwareStatus({
                    isOnline: data.isOnline || false,
                    connectionType: data.connectionType || 'unknown',
                    signalStrength: data.signalStrength || 0,
                    batteryLevel: data.batteryLevel || 0,
                    lastSeen: data.lastSeen?.toDate() || null
                });
            }
        });

        return () => unsubscribe();
    }, [cartId]);

    return (
        <div className="hardware-status-container">
            <h3 className="hardware-status-title">Hardware Status</h3>
            <div className="hardware-status-grid">
                <div className="status-item">
                    <span className="status-label">Connection:</span>
                    <span className={`status-value ${hardwareStatus.isOnline ? 'online' : 'offline'}`}>
                        {hardwareStatus.isOnline ? 'Online' : 'Offline'}
                    </span>
                </div>
                <div className="status-item">
                    <span className="status-label">Network:</span>
                    <span className="status-value">
                        {hardwareStatus.connectionType === 'wifi' ? 'WiFi' : 
                         hardwareStatus.connectionType === 'gsm' ? 'GSM' : 'Unknown'}
                    </span>
                </div>
                <div className="status-item">
                    <span className="status-label">Signal:</span>
                    <div className="signal-strength">
                        {[...Array(4)].map((_, i) => (
                            <div 
                                key={i} 
                                className={`signal-bar ${i < Math.ceil(hardwareStatus.signalStrength / 25) ? 'active' : ''}`}
                            />
                        ))}
                    </div>
                </div>
                <div className="status-item">
                    <span className="status-label">Last Seen:</span>
                    <span className="status-value">
                        {hardwareStatus.lastSeen ? 
                            new Date(hardwareStatus.lastSeen).toLocaleTimeString() : 
                            'Never'}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default HardwareStatus;