import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { Html5QrcodeScanner } from 'html5-qrcode';
import './InventoryPage.css';

const InventoryPage = () => {
  const { currentUser } = useAuth();
  const [step, setStep] = useState(1); // 1: Product Details, 2: Scan Barcodes
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [productDetails, setProductDetails] = useState({
    name: '',
    company: '',
    category: '',
    weight: '', // e.g., "100g", "500ml"
    mrp: '',
    discountPercent: '0', // Default to 0%
    targetStock: '1' // How many pieces user intends to add initially
  });
  const [scannedBarcodes, setScannedBarcodes] = useState([]);
  const [currentScanError, setCurrentScanError] = useState('');
  const scannerRef = useRef(null);
  const qrCodeScannerId = "inventory-barcode-scanner";

  // --- Step 1: Handle Product Detail Input --- 
  const handleDetailChange = (e) => {
    const { name, value } = e.target;
    setProductDetails(prev => ({ ...prev, [name]: value }));
  };

  // MODIFIED: Just validates and proceeds to step 2
  const proceedToScanStep = (e) => {
    e.preventDefault();
    setError('');
    
    // Basic Validation
    if (!productDetails.name || !productDetails.mrp || !productDetails.targetStock) {
        setError('Product Name, MRP, and Target Stock count are required.');
        return;
    }
    if (isNaN(parseFloat(productDetails.mrp)) || isNaN(parseInt(productDetails.targetStock)) || isNaN(parseFloat(productDetails.discountPercent))) {
        setError('MRP, Target Stock, and Discount % must be valid numbers.');
        return;
    }
    if (parseInt(productDetails.targetStock) <= 0) {
        setError('Target Stock must be at least 1.');
        return;
    }

    // Validation passed, move to scanning step
    setScannedBarcodes([]); // Reset scanned list
    setCurrentScanError('');
    setStep(2);
  };

  // --- Step 3 & 4: Handle Barcode Scanning and Saving Items ---

  // Scanner Initialization Effect
  useEffect(() => {
    if (step === 2) {
      const scannerElement = document.getElementById(qrCodeScannerId);
      if (!scannerElement) {
        console.error(`Scanner element ${qrCodeScannerId} not found.`);
        return;
      }

      if (!scannerRef.current) {
        const html5QrcodeScanner = new Html5QrcodeScanner(
          qrCodeScannerId,
          {
            fps: 5, // Lower FPS might be fine for barcodes
            qrbox: { width: 300, height: 100 }, // Rectangular might be better for barcodes
            rememberLastUsedCamera: true,
            showTorchButtonIfSupported: true,
            aspectRatio: 1.5, // Adjust based on typical barcode shape
          },
          false
        );

        scannerRef.current = html5QrcodeScanner;
        html5QrcodeScanner.render(handleBarcodeScanSuccess, handleBarcodeScanFailure);
      }
    } else {
      // Cleanup scanner if moving away from step 2
      if (scannerRef.current) {
        scannerRef.current.clear().catch(error => console.error("Failed to clear scanner.", error));
        scannerRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(error => console.error("Failed to clear scanner on unmount.", error));
        scannerRef.current = null;
      }
    };
  }, [step]); // Re-run when step changes

  const handleBarcodeScanSuccess = async (decodedText, decodedResult) => {
    const barcode = decodedText.trim();
    setCurrentScanError(''); // Clear previous scan error

    if (!barcode) {
      setCurrentScanError('Invalid barcode scanned.');
      return;
    }

    // Prevent adding more than the target stock initially
    if (scannedBarcodes.length >= parseInt(productDetails.targetStock)) {
      setCurrentScanError(`Target stock (${productDetails.targetStock}) reached. Finish adding or add more stock later.`);
      if (scannerRef.current) { // Stop the scanner
         try { await scannerRef.current.pause(true); } catch(e){ console.warn("Couldn't pause scanner"); } 
      }
      return;
    }

    // Check if barcode already scanned in *this session*
    if (scannedBarcodes.some(item => item.barcode === barcode)) {
      setCurrentScanError(`Barcode ${barcode} already scanned for this product.`);
      return;
    }

    // Check if barcode exists globally for this store (in Firestore)
    try {
        const itemsRef = collection(db, 'inventoryItems');
        const q = query(itemsRef, where('barcode', '==', barcode), where('storeId', '==', currentUser.uid));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            setCurrentScanError(`Barcode ${barcode} already exists in inventory for another product.`);
            return;
        }
    } catch (checkError) {
        console.error("Error checking existing barcode:", checkError);
        setCurrentScanError(`Failed to verify barcode ${barcode}. Please try again.`);
        return;
    }

    // Add to the temporary list for saving later
    setScannedBarcodes(prev => [...prev, { barcode: barcode, storeId: currentUser.uid, status: 'in_stock' }]);
    // Optional: Resume scanner if paused
    if (scannerRef.current) { try { await scannerRef.current.resume(); } catch(e) {} }
  };

  const handleBarcodeScanFailure = (error) => {
    // Usually ignore scan failures
    // console.warn(`Barcode scan error = ${error}`);
  };

  // MODIFIED: Creates Product AND Items in one batch
  const saveProductAndItems = async () => {
      if (scannedBarcodes.length === 0) {
          setError("No barcodes were scanned.");
          return;
      }
      // Ensure target stock was met (or prompt user? For now, just check)
      if (scannedBarcodes.length !== parseInt(productDetails.targetStock)) {
          setError(`Scanned ${scannedBarcodes.length} barcodes, but expected ${productDetails.targetStock}. Please scan all items.`);
          return;
      }
      
      setIsLoading(true);
      setError('');

      try {
        const batch = writeBatch(db);
        
        // 1. Prepare and add Product Creation to batch
        const productsRef = collection(db, 'products');
        const newProductRef = doc(productsRef); // Generate ID locally
        const newProductId = newProductRef.id;
        
        batch.set(newProductRef, {
          ...productDetails,
          mrp: parseFloat(productDetails.mrp),
          discountPercent: parseFloat(productDetails.discountPercent),
          targetStock: parseInt(productDetails.targetStock),
          currentStock: scannedBarcodes.length, // Stock equals scanned items
          storeId: currentUser.uid,
          status: 'active', // Set to active directly
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // 2. Prepare and add Inventory Item Creations to batch
        const itemsRef = collection(db, 'inventoryItems');
        scannedBarcodes.forEach(itemData => {
            const newItemRef = doc(itemsRef); // Auto-generate ID for inventory item
            batch.set(newItemRef, {
                ...itemData, // contains barcode, storeId, status
                productId: newProductId, // Link to the product created above
                addedAt: serverTimestamp()
            });
        });

        // 3. Commit the batch
        await batch.commit();

        // Reset state after successful addition
        setProductDetails({ name: '', company: '', category: '', weight: '', mrp: '', discountPercent: '0', targetStock: '1' });
        setScannedBarcodes([]);
        setStep(1); // Go back to step 1
        alert('Product and items added successfully!'); 

      } catch(err) {
        console.error("Error saving product and items:", err);
        setError("Failed to save product/items. Please check connection and try again.");
      } finally {
          setIsLoading(false);
      }
  };

  // --- Render Logic --- 
  return (
    <div className="inventory-page">
      <div className="inventory-container">
        <h1 className="inventory-title">Manage Inventory</h1>

        {error && <p className="error-message main-error">{error}</p>}

        {/* Step 1: Product Details Form */}
        {step === 1 && (
          <section className="add-item-section card">
            <h2 className="section-title">Step 1: Add New Product Details</h2>
            <form onSubmit={proceedToScanStep} className="product-details-form">
              {/* Input fields for name, company, category, weight, mrp, discountPercent, targetStock */}
              <div className="form-grid">
                 <div className="form-group">
                    <label htmlFor="name">Product Name*</label>
                    <input type="text" id="name" name="name" value={productDetails.name} onChange={handleDetailChange} required />
                 </div>
                 <div className="form-group">
                    <label htmlFor="company">Company</label>
                    <input type="text" id="company" name="company" value={productDetails.company} onChange={handleDetailChange} />
                 </div>
                 <div className="form-group">
                    <label htmlFor="category">Category</label>
                    <input type="text" id="category" name="category" value={productDetails.category} onChange={handleDetailChange} />
                 </div>
                 <div className="form-group">
                    <label htmlFor="weight">Weight/Volume</label>
                    <input type="text" id="weight" name="weight" value={productDetails.weight} onChange={handleDetailChange} placeholder="e.g., 100g, 1L"/>
                 </div>
                 <div className="form-group">
                    <label htmlFor="mrp">MRP*</label>
                    <input type="number" step="0.01" id="mrp" name="mrp" value={productDetails.mrp} onChange={handleDetailChange} required />
                 </div>
                 <div className="form-group">
                    <label htmlFor="discountPercent">Discount (%)</label>
                    <input type="number" step="0.1" min="0" max="100" id="discountPercent" name="discountPercent" value={productDetails.discountPercent} onChange={handleDetailChange} />
                 </div>
                  <div className="form-group">
                    <label htmlFor="targetStock">Initial Stock Count*</label>
                    <input type="number" step="1" min="1" id="targetStock" name="targetStock" value={productDetails.targetStock} onChange={handleDetailChange} required title="How many barcodes will you scan next?" />
                 </div>
              </div>
              <button type="submit" className="button button-primary" disabled={isLoading}>
                Proceed to Scan Barcodes
              </button>
            </form>
          </section>
        )}

        {/* Step 2: Scan Barcodes */}
        {step === 2 && (
          <section className="scan-items-section card">
            <h2 className="section-title">Step 2: Scan Barcodes for {productDetails.name}</h2>
            <p>Scan the unique barcode on each physical item. Target: {productDetails.targetStock} items.</p>
            
            <div className="scanner-container">
               <div id={qrCodeScannerId} className="barcode-scanner-element"></div>
            </div>

            {currentScanError && <p className="error-message scan-error">{currentScanError}</p>}

            <div className="scanned-items-feedback">
              <p>Scanned: {scannedBarcodes.length} / {productDetails.targetStock}</p>
              {/* Optional: Display list of scanned barcodes */} 
              {/* <ul className="scanned-list"> {scannedBarcodes.map((item, index) => <li key={index}>{item.barcode}</li>)} </ul> */} 
            </div>

             <div className="scan-actions">
                 <button 
                    onClick={() => setStep(1)} 
                    className="button button-secondary" 
                    disabled={isLoading}
                 >
                     Back to Details
                 </button>
                 <button 
                    onClick={saveProductAndItems} 
                    className="button button-success" 
                    disabled={isLoading || scannedBarcodes.length !== parseInt(productDetails.targetStock)}
                 >
                     {isLoading ? 'Saving...' : `Save Product & ${scannedBarcodes.length} Items`}
                 </button>
             </div>
          </section>
        )}

        {/* Placeholder for Inventory List (remains the same for now) */}
        <section className="inventory-list-section card">
          <h2 className="section-title">Inventory Items</h2>
          <p>Inventory list display coming soon...</p>
          {/* TODO: Implement inventory list/table display */}
        </section>

      </div>
    </div>
  );
};

export default InventoryPage; 