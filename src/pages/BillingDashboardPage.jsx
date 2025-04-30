import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, onSnapshot, runTransaction, collection, query, where, getDocs, serverTimestamp, arrayUnion, arrayRemove, increment, updateDoc, addDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Html5QrcodeScanner } from 'html5-qrcode';
import './BillingDashboardPage.css'; // Create later
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Helper function to format currency (can be moved to a utils file)
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
};

// --- Bill Component (for PDF generation) ---
// This component will be rendered off-screen for capture
const BillComponent = React.forwardRef(({ billData }, ref) => {
  if (!billData) return null;

  const { 
    storeName = 'Store',
    storeAddress = '', // Add later if needed
    storeUpiId = '', // Add later if needed
    billNumber = 'N/A',
    cartDisplayId = 'N/A',
    customerName = 'Customer',
    customerPhoneNumber = 'N/A',
    items = [],
    totalAmount = 0,
    date = new Date().toLocaleString() // Simple date for now
  } = billData;

  return (
    <div ref={ref} className="bill-container-for-pdf" style={{ padding: '20px', width: '400px', border: '1px solid #ccc', fontFamily: 'sans-serif', backgroundColor: 'white', color: 'black' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '10px' }}>{storeName}</h2>
      {storeAddress && <p style={{ textAlign: 'center', fontSize: '0.8em', marginBottom: '20px' }}>{storeAddress}</p>}
      <hr style={{ borderTop: '1px dashed #ccc' }} />
      <p><strong>Bill No:</strong> {billNumber}</p>
      <p><strong>Date:</strong> {date}</p>
      <p><strong>Cart ID:</strong> {cartDisplayId}</p>
      <p><strong>Customer:</strong> {customerName} ({customerPhoneNumber})</p>
      <hr style={{ borderTop: '1px dashed #ccc', margin: '15px 0' }} />
      <h3 style={{ marginBottom: '10px' }}>Items:</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '5px', borderBottom: '1px solid #eee' }}>Item</th>
            <th style={{ textAlign: 'right', padding: '5px', borderBottom: '1px solid #eee' }}>Price</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.barcode}-${index}`}>
              <td style={{ padding: '5px' }}>{item.name}</td>
              <td style={{ textAlign: 'right', padding: '5px' }}>{formatCurrency(item.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr style={{ borderTop: '1px dashed #ccc', margin: '15px 0' }} />
      <p style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.1em' }}>
        Total Amount: {formatCurrency(totalAmount)}
      </p>
      <hr style={{ borderTop: '1px dashed #ccc', marginTop: '15px' }} />
      {storeUpiId && <p style={{ fontSize: '0.8em', marginTop: '10px' }}>Pay via UPI: {storeUpiId}</p>}
      <p style={{ textAlign: 'center', fontSize: '0.8em', marginTop: '20px' }}>Thank you for shopping!</p>
    </div>
  );
});

const BillingDashboardPage = () => {
  const { cartId } = useParams(); // Get cartId (Firestore Doc ID) from URL
  const [sessionData, setSessionData] = useState(null);
  const [storeData, setStoreData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // --- State for Customer Details Entry ---
  const [customerPhoneNumber, setCustomerPhoneNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [isSubmittingDetails, setIsSubmittingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [provisionalBillNo, setProvisionalBillNo] = useState('');

  // --- State for Bill Generation ---
  const [isGeneratingBill, setIsGeneratingBill] = useState(false);
  const billRef = useRef(); // Ref for the BillComponent

  // --- State for Scanner ---
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState('');
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const scannerRef = useRef(null);
  const qrCodeScannerId = "billing-barcode-scanner";

  // Flag to prevent multiple creation attempts if listener fires quickly
  const sessionCreationAttempted = useRef(false);

  // Real-time listener for Cart Session with Auto-Creation Logic
  useEffect(() => {
    if (!cartId) {
      setError('No Cart ID provided in URL.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    sessionCreationAttempted.current = false; // Reset attempt flag on ID change

    const sessionRef = doc(db, 'cartSessions', cartId);

    const unsubscribe = onSnapshot(sessionRef, async (docSnap) => {
      if (docSnap.exists()) {
        // --- Session Document Exists --- 
        const data = docSnap.data();
        const status = data.status;
        console.log(`[Listener] Received snapshot. Status: ${status}`, data);

        sessionCreationAttempted.current = true; // Mark as found/created
        const lastActivity = data.lastActivityAt; // Firestore Timestamp or null
        const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

        // ** Stale Session Check (Include 'available' as potentially stale) **
        if ((status === 'active' || status === 'checkout_initiated' || status === 'available') && lastActivity?.toMillis) {
            const timeSinceLastActivity = Date.now() - lastActivity.toMillis();
            // Add extra check: Only delete 'available' status if it's REALLY old maybe?
            // Or just delete any old session regardless of status being active/checkout/available
            // Let's delete any session older than the threshold for simplicity now.
            if (timeSinceLastActivity > STALE_THRESHOLD_MS) {
                console.warn(`Session ${cartId} detected as stale (Status: ${status}, last activity ${Math.round(timeSinceLastActivity / 60000)} mins ago). Calling handleStaleSession...`);
                handleStaleSession(cartId); 
                return; // Stop processing this snapshot, wait for reset update
            }
        }
        // ** End Stale Session Check **

        // Only update state if the session wasn't deemed stale in this run
        setSessionData(data); 
        setError(''); // Clear errors
        setDetailsError(''); 
        // Fetch store data if needed
        if (data.storeId && !storeData) {
             fetchStoreData(data.storeId);
        }
        // Pre-fill phone number if present
        if (data.customerPhoneNumber && !customerPhoneNumber) {
            setCustomerPhoneNumber(data.customerPhoneNumber);
        }
        // Pre-fill name if available in session (or customer record later)
        if (data.customerName && !customerName) {
            setCustomerName(data.customerName);
        }

        // Set provisional bill number if present in data
        if (data.provisionalBillNumber) {
            setProvisionalBillNo(data.provisionalBillNumber);
        }
        
        // Deactivate activating state if session is active
        if (data.status === 'active' || data.status === 'checkout_initiated') {
             setIsActivating(false);
        }
        setIsLoading(false);
      } else {
        // --- Session Document DOES NOT Exist --- 
        console.log(`Cart session ${cartId} not found. Checking physical cart...`);
        // Avoid multiple creation attempts
        if (sessionCreationAttempted.current) {
            console.log("Session creation already attempted or session found previously, skipping.");
             if (!isLoading && !error) {
                 // If creation was attempted and session *still* doesn't exist, the physical cart must be unavailable
                 setError(`Session for cart ${cartId} could not be started or found. Check physical cart status.`);
             }
            return;
        }
        sessionCreationAttempted.current = true; // Mark that we are attempting creation

        try {
            // 1. Check the physical cart in the 'carts' collection
            const physicalCartRef = doc(db, 'carts', cartId);
            const physicalCartSnap = await getDoc(physicalCartRef);

            if (physicalCartSnap.exists()) {
                let physicalCartStatus = physicalCartSnap.data().status;
                console.log(`Physical cart ${cartId} found. Status: ${physicalCartStatus}`);

                // ** NEW: Attempt to reset physical cart if 'in_use' **
                if (physicalCartStatus === 'in_use') {
                    console.warn(`Physical cart ${cartId} is 'in_use'. Attempting client-side reset to 'available'...`);
                    try {
                        await updateDoc(physicalCartRef, { status: 'available', lastActivity: serverTimestamp() });
                        console.log(`Client-side reset successful for physical cart ${cartId}.`);
                        physicalCartStatus = 'available'; // Assume success for the next check
                    } catch (resetError) {
                        console.error(`Client-side reset failed for physical cart ${cartId}:`, resetError);
                        // Proceed anyway, the session creation check below will handle the final state
                    }
                }
                // ** End NEW **

                // Now check if it's available (either initially or after reset attempt)
                if (physicalCartStatus === 'available') { 
                    console.log(`Physical cart ${cartId} is available. Creating session...`);
                    const physicalCartData = physicalCartSnap.data();

                    // Create the new cart session document
                    const newSessionData = {
                        cartDisplayId: physicalCartData.cartDisplayId || cartId,
                        cartFirestoreId: cartId, 
                        storeId: physicalCartData.storeId,
                        status: 'pending_details', 
                        customerId: null,
                        customerPhoneNumber: null,
                        customerName: null,
                        currentItems: [],
                        currentTotalAmount: 0,
                        currentExpectedWeight: 0,
                        createdAt: serverTimestamp(),
                        lastActivityAt: serverTimestamp(),
                        activatedAt: null
                    };
                    // Use sessionRef defined outside this block
                    await setDoc(doc(db, 'cartSessions', cartId), newSessionData); 
                    console.log(`Cart session ${cartId} creation initiated.`);
                    
                    // Update physical cart status to 'in_use' (now that session is created)
                    await updateDoc(physicalCartRef, { status: 'in_use', lastActivity: serverTimestamp() });
                    console.log(`Physical cart ${cartId} status updated to in_use.`);
                    // Listener will pick up the new session
                    
                } else {
                    // Physical cart exists but is NOT available (e.g., reset failed or was already unavailable)
                    console.error(`Cannot start session: Physical cart ${cartId} is not available (its status is ${physicalCartStatus}).`);
                    setError(`Shopping cart ${cartId} is not available.`);
                    setSessionData(null);
                    setIsLoading(false);
                }
            } else {
                 // Physical cart document itself doesn't exist
                 console.error(`Cannot start session: Physical cart ${cartId} does not exist.`);
                 setError(`Shopping cart ${cartId} does not exist.`);
                 setSessionData(null);
                 setIsLoading(false);
            }
        } catch (err) {
             console.error("Error checking physical cart or creating session:", err);
             setError('Failed to initialize the shopping session. Please try again.');
             setSessionData(null);
             setIsLoading(false);
        }
      }
    }, (err) => {
      // --- Listener Error --- 
      console.error("Error listening to cart session:", err);
      setError('Failed to load cart session data due to a listener error.');
      setSessionData(null);
      setIsLoading(false);
      setIsActivating(false); // Reset activation on listener error
    });

    // Cleanup listener on unmount
    return () => unsubscribe();

  }, [cartId]); // Re-run only if cartId changes

  // useEffect to generate provisional bill number when session becomes active
  useEffect(() => {
    // Trigger only when session is active, store data is loaded, and bill number hasn't been generated/set yet
    if (sessionData && sessionData.status === 'active' && storeData && !provisionalBillNo && !sessionData.provisionalBillNumber) {
        console.log("Attempting to generate provisional bill number...");
        generateProvisionalBillNumber();
    }
  }, [sessionData, storeData, provisionalBillNo]); // Depend on session, store data, and the bill number itself

  // useEffect to handle setting isActivating based on sessionData status
  useEffect(() => {
    // Check if sessionData exists and the status indicates it's active (or beyond)
    if (sessionData && (sessionData.status === 'active' || sessionData.status === 'checkout_initiated' || sessionData.status === 'completed' || sessionData.status === 'payment_success' || sessionData.status === 'error')) {
      // If the session is definitively NOT in pending_details, stop the activating indicator
      setIsActivating(false);
    }
    // If sessionData becomes null (e.g., due to error or invalid ID), also stop activating
    if (!sessionData) {
         setIsActivating(false);
    }
  }, [sessionData]); // Dependency on the sessionData state itself

  // Function to fetch store details
  const fetchStoreData = async (storeId) => {
     try {
        const storeRef = doc(db, 'stores', storeId);
        const storeSnap = await getDoc(storeRef);
        if(storeSnap.exists()) {
            setStoreData(storeSnap.data());
        } else {
            console.warn("Store data not found for session storeId:", storeId);
            setError(prev => (prev ? prev + '; ' : '') + ' Store details missing.');
        }
     } catch (err) {
        console.error("Error fetching store data:", err);
        setError(prev => (prev ? prev + '; ' : '') + ' Failed to load store details.');
     }
  };

  // --- Handle Customer Details Submission ---
  const handleDetailsSubmit = async (e) => {
      e.preventDefault();
      setDetailsError('');
      const phoneValid = customerPhoneNumber && /^\d{10}$/.test(customerPhoneNumber);
      const nameValid = customerName && customerName.trim().length > 0;

      if (!phoneValid) { setDetailsError('Please enter a valid 10-digit phone number.'); return; }
      if (!nameValid) { setDetailsError('Please enter your name.'); return; }
      if (!sessionData || !sessionData.storeId) { setDetailsError('Session not loaded. Please refresh.'); return; }

      setIsSubmittingDetails(true);
      setIsActivating(true); // Set activation state true
      
      try {
          let customerId = null;
          let customerDocData = {};
          const customersRef = collection(db, 'customers');
          const q = query(customersRef, where('phoneNumber', '==', customerPhoneNumber), where('storeId', '==', sessionData.storeId));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
              const customerDoc = querySnapshot.docs[0];
              customerId = customerDoc.id;
              customerDocData = customerDoc.data();
              console.log('Existing customer found:', customerId);
              const updateData = { lastInteractionAt: serverTimestamp() };
              if (!customerDocData.name) {
                  updateData.name = customerName.trim();
              }
              await updateDoc(doc(db, 'customers', customerId), updateData);
          } else {
              console.log('Creating new customer:', customerPhoneNumber, customerName);
              const newCustomerData = {
                  phoneNumber: customerPhoneNumber,
                  storeId: sessionData.storeId,
                  name: customerName.trim(),
                  createdAt: serverTimestamp(),
                  lastInteractionAt: serverTimestamp(),
              };
              const newCustomerRef = await addDoc(customersRef, newCustomerData);
              customerId = newCustomerRef.id;
              console.log('New customer created:', customerId);
          }

          // Update the cart session document
          const sessionRef = doc(db, 'cartSessions', cartId);
          await updateDoc(sessionRef, {
              customerId: customerId,
              customerPhoneNumber: customerPhoneNumber,
              customerName: customerName.trim(),
              status: 'active',
              activatedAt: serverTimestamp(),
              lastActivityAt: serverTimestamp()
          });
          console.log('Cart session activation request sent for:', customerId);
          // Activation state (isActivating) will be set to false by the listener

      } catch (err) {
          console.error("Error submitting details:", err);
          setDetailsError('Failed to save details. Please try again.');
          setIsActivating(false); // SET activation false only on error
      } finally {
          setIsSubmittingDetails(false);
      }
  };

  // --- Scanner Initialization useEffect ---
  // Only run scanner setup if the session is active
  useEffect(() => {
    const isSessionActiveForScanning = sessionData?.status === 'active';
    if (showScanner && isSessionActiveForScanning) {
        const scannerElement = document.getElementById(qrCodeScannerId);
        if (!scannerElement) {
             console.error(`Scanner element ${qrCodeScannerId} not found.`);
             return;
        }
        if (!scannerRef.current) {
            const config = {
                 fps: 10,
                 qrbox: { width: 250, height: 250 },
                 rememberLastUsedCamera: true,
                 showTorchButtonIfSupported: true,
            };
            const html5QrcodeScanner = new Html5QrcodeScanner(qrCodeScannerId, config, false);
            scannerRef.current = html5QrcodeScanner;
            html5QrcodeScanner.render(handleScanSuccess, handleScanFailure);
        }
    } else {
        if (scannerRef.current) {
            scannerRef.current.clear().catch(error => console.error("Failed to clear scanner.", error));
            scannerRef.current = null;
        }
    }
    return () => {
        if (scannerRef.current) {
            scannerRef.current.clear().catch(error => console.error("Failed to clear scanner on unmount.", error));
            scannerRef.current = null;
        }
    };
  }, [showScanner, sessionData?.status]);

  // Handle Scan Success - Core Logic
  const handleScanSuccess = async (decodedText, decodedResult) => {
      if (sessionData?.status !== 'active') {
          setScanError("Cannot scan items until the session is active.");
          if (scannerRef.current) { try { scannerRef.current.pause(true); } catch(e){} }
          return;
      }
      const barcode = decodedText.trim();
      setScanError(''); 
      if (!barcode || isProcessingScan) {
          return; 
      }
      setIsProcessingScan(true);
      console.log(`Processing barcode: ${barcode}`);
      try {
        if (!sessionData?.storeId) {
            throw new Error("Session data or Store ID is not loaded yet.");
        }
        const itemsRef = collection(db, 'inventoryItems');
        const q = query( itemsRef, where('barcode', '==', barcode), where('storeId', '==', sessionData.storeId) );
        const inventorySnapshot = await getDocs(q);
        let inventoryItemDoc = null;
        let inventoryItemData = null;
        const itemsInCart = sessionData.currentItems || [];
        const existingItemIndex = itemsInCart.findIndex(item => item.barcode === barcode);
        if (existingItemIndex > -1) {
             console.log(`Item ${barcode} found in current cart, proceeding to removal.`);
             inventoryItemData = itemsInCart[existingItemIndex]; 
        } else if (!inventorySnapshot.empty) {
            inventoryItemDoc = inventorySnapshot.docs[0]; 
            inventoryItemData = inventoryItemDoc.data();
            if (inventoryItemData.status !== 'in_stock') {
                throw new Error(`Item ${barcode} cannot be added as it's not currently in stock (${inventoryItemData.status}).`);
            }
        } else {
            throw new Error(`Item with barcode ${barcode} not found for this store.`);
        }
        const productId = inventoryItemData.productId; 
        if (!productId){
            throw new Error(`Missing productId for barcode ${barcode}. Data inconsistency.`);
        }
        const productRef = doc(db, 'products', productId);
        const productSnap = await getDoc(productRef);
        if (!productSnap.exists()) {
            throw new Error(`Product details not found for ID: ${productId}`);
        }
        const productData = productSnap.data();
        const itemSessionData = {
            barcode: barcode,
            productId: productId,
            name: productData.name || 'Unknown Item',
            price: productData.mrp || 0, 
            weightValue: parseFloat(productData.weightValue) || 0, 
            weightUnit: productData.weightUnit || ''
        };
        const sessionRef = doc(db, 'cartSessions', cartId);
        await runTransaction(db, async (transaction) => {
            const sessionDoc = await transaction.get(sessionRef);
            if (!sessionDoc.exists()) {
                throw new Error("Session document missing unexpectedly during transaction.");
            }
            const currentSessionData = sessionDoc.data();
            const currentItems = currentSessionData.currentItems || [];
            const txExistingItemIndex = currentItems.findIndex(item => item.barcode === barcode);
            let updatedItems;
            let amountChange = 0;
            let weightChange = 0;
            if (txExistingItemIndex > -1) {
                console.log(`Removing item: ${barcode} via transaction`);
                const removedItem = currentItems[txExistingItemIndex];
                updatedItems = currentItems.filter((_, index) => index !== txExistingItemIndex);
                amountChange = -(removedItem.price || 0);
                weightChange = -(removedItem.weightValue || 0);
            } else {
                console.log(`Adding item: ${barcode} via transaction`);
                updatedItems = [...currentItems, itemSessionData];
                amountChange = itemSessionData.price;
                weightChange = itemSessionData.weightValue;
            }
            transaction.update(sessionRef, {
                currentItems: updatedItems,
                currentTotalAmount: increment(amountChange),
                currentExpectedWeight: increment(weightChange),
                lastActivityAt: serverTimestamp()
            });
        });
        console.log(`Transaction successful for barcode: ${barcode}`);
         if (scannerRef.current) {
             try {
               scannerRef.current.pause(true); 
               setTimeout(() => {
                  if(scannerRef.current && showScanner && (sessionData?.status === 'active')) {
                      scannerRef.current.resume();
                  }
               }, 500); 
             } catch (e) {
                 console.warn("Could not pause/resume scanner:", e);
             }
         }
      } catch (err) {
        console.error("Error processing scan:", err);
        setScanError(err.message || "Failed to process scanned item.");
      } finally {
        setIsProcessingScan(false);
      }
  };

  // Handle Scan Failure
  const handleScanFailure = (error) => {
    // console.warn(`Code scan error = ${error}`); // Reduce console noise
  };

  // --- Generate Provisional Bill Number Function ---
  const generateProvisionalBillNumber = async () => {
      if (!storeData || !sessionData || !cartId) {
          console.error("Missing data for bill number generation.");
          return;
      }
      
      // 1. Get Date in YYYY/MM/DD format
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}${mm}${dd}`; // Format with slashes
      const fullDateStr = `${yyyy}-${mm}-${dd}`; // For counter ID (uses hyphens)

      // 2. Counter Doc ID (for daily customer count)
      const counterDocId = `${sessionData.storeId}_${fullDateStr}`;
      const counterRef = doc(db, "dailyCounters", counterDocId);
      const sessionRef = doc(db, "cartSessions", cartId);

      console.log(`Using counter doc: ${counterDocId}`);

      try {
          await runTransaction(db, async (transaction) => {
              const counterDoc = await transaction.get(counterRef);
              let currentCount = counterDoc.exists() ? (counterDoc.data().count || 0) : 0;
              
              // Increment count by 1 and handle rollover
              currentCount = currentCount + 1;
              if (currentCount > 500) currentCount = 1;
              
              // Format number as single digit (1-9)
              const customerSerial = String(currentCount % 10 || 10);

              // 4. Construct Bill Number in format: YYYY/MM/DD@CustomerSerial
              const billNumber = `${dateStr}${customerSerial}`;
              console.log(`Generated Provisional Bill No: ${billNumber}`);

              // 5. Update Counter
              transaction.set(counterRef, { 
                  count: currentCount,
                  lastUpdated: serverTimestamp() 
              }, { merge: true });

              // 6. Update Session with Provisional Bill Number
              transaction.update(sessionRef, { 
                  provisionalBillNumber: billNumber,
                  lastActivityAt: serverTimestamp()
              });
          });
          console.log("Transaction successful: Counter and Session updated.");

      } catch (error) {
          console.error("Transaction failed for generating bill number:", error);
          setError("Failed to generate provisional bill number.");
      }
  };

  // --- Save Bill Data to Firestore ---
  const saveBillToFirestore = async (billDetails) => {
      if (!billDetails || !billDetails.billNumber) {
          console.error("Missing data to save bill.");
          throw new Error("Cannot save bill, essential data missing.");
      }
      console.log("Attempting to save bill to Firestore:", billDetails.billNumber);
      try {
          // 1. Create doc in 'bills' collection (Using billNumber as ID for idempotency)
          const billRef = doc(db, "bills", billDetails.billNumber);
          await setDoc(billRef, {
              ...billDetails, // Spread all details
              savedAt: serverTimestamp()
          });
          console.log("Bill saved successfully to Firestore:", billDetails.billNumber);
          
          // 2. Update cart session status (Optional: could add billRef ID too)
          const sessionRef = doc(db, "cartSessions", cartId);
          await updateDoc(sessionRef, {
              status: 'checkout_initiated', // Mark as checkout started
              finalBillNumber: billDetails.billNumber, // Store the final bill number used
              lastActivityAt: serverTimestamp()
          });
          console.log("Cart session status updated to checkout_initiated.");

      } catch (error) {
          console.error("Error saving bill to Firestore:", error);
          // Re-throw the error so handlePayment knows it failed
          throw new Error(`Failed to save bill ${billDetails.billNumber} to Firestore.`); 
      }
  };

  // --- Generate and Download PDF ---
  const generateAndDownloadPdf = async (billDetails) => {
      if (!billRef.current || !billDetails || !billDetails.billNumber) {
          console.error("Bill component ref or bill data missing for PDF generation.");
          return; // Don't throw error, just skip PDF if ref is missing
      }
      console.log("Generating PDF for bill:", billDetails.billNumber);
      try {
          const canvas = await html2canvas(billRef.current, { scale: 2 }); // Use scale for better quality
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF({
              orientation: 'portrait',
              unit: 'px', // Use pixels for easier mapping from canvas
              format: [canvas.width, canvas.height] // Use canvas dimensions
          });
          pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
          const pdfFilename = `BILL${billDetails.billNumber}.pdf`;
          pdf.save(pdfFilename);
          console.log("PDF download triggered:", pdfFilename);
      } catch (error) {
          console.error("Error generating PDF:", error);
          // Notify user, but don't stop the payment flow for this prototype
          alert("Could not generate bill PDF, but proceeding to payment."); 
      }
  };

  // --- Handle Payment Button Click (MODIFIED) ---
  const handlePayment = async () => {
      setError(''); // Clear previous errors
      // **Precondition Checks**
      if (!storeData?.upiId || !sessionData?.currentTotalAmount || !provisionalBillNo) {
          alert('Cannot initiate payment. Missing Store UPI ID, Cart Amount, or Bill Number.');
          return;
      }
      if (sessionData.currentTotalAmount <= 0) {
          alert('Cannot pay for an empty cart.');
          return;
      }
      if (sessionData?.status !== 'active') {
          alert(`Cart status is currently '${sessionData?.status}'. Cannot initiate payment.`);
          return;
      }

      setIsGeneratingBill(true); // Show loading state

      // **Prepare Bill Data**
      const billDetails = {
          storeId: storeData.storeId || sessionData.storeId,
          storeName: storeData.storeName,
          storeUpiId: storeData.upiId,
          storeAddress: storeData.address || '', // Add if you have address in storeData
          billNumber: provisionalBillNo, // Use the generated provisional number
          cartId: cartId,
          cartDisplayId: sessionData.cartDisplayId,
          customerId: sessionData.customerId,
          customerName: sessionData.customerName,
          customerPhoneNumber: sessionData.customerPhoneNumber,
          items: sessionData.currentItems || [],
          totalAmount: sessionData.currentTotalAmount,
          date: new Date().toISOString(), // Store ISO date for consistency
          // Add any other relevant fields like weight, etc.
          currentExpectedWeight: sessionData.currentExpectedWeight || 0,
      };
      
      let firestoreSaved = false;
      try {
          // **1. Save to Firestore (Await this)**
          await saveBillToFirestore(billDetails);
          firestoreSaved = true;

          // **2. Generate and Download PDF (Don't necessarily await user interaction)**
          // Run this after successful save, but don't block redirection on it finishing
          generateAndDownloadPdf(billDetails); 

      } catch (error) {
          console.error("Error during bill processing:", error);
          setError(error.message || "Failed to save bill details. Cannot proceed to payment.");
          setIsGeneratingBill(false);
          return; // Stop if Firestore save failed
      }

      // **3. Redirect to UPI (Only if Firestore save was successful)**
      if (firestoreSaved) {
            console.log("Redirecting to UPI...");
            const storeName = storeData.storeName || 'Merchant';
            const amount = sessionData.currentTotalAmount.toFixed(2);
            const upiId = storeData.upiId;
            // Use bill number in transaction note for better tracking
            const transactionNote = `Payment for Bill ${provisionalBillNo}`; 
            const encodedNote = encodeURIComponent(transactionNote);
            const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(storeName)}&am=${amount}&tn=${encodedNote}&cu=INR`;
            
            // Small delay maybe needed for PDF generation to start? Optional.
            // await new Promise(resolve => setTimeout(resolve, 200)); 
            
            window.location.href = upiUrl;
            // Set generating state false might happen after redirect, which is okay
            // setIsGeneratingBill(false); 
      } else {
          // This case should ideally be caught by the error handling above
          console.error("Firestore save failed, not redirecting.");
          setError("Failed to save bill details. Payment not initiated.");
          setIsGeneratingBill(false);
      }
      // Note: isGeneratingBill might stay true if redirection happens immediately
  };

  // --- Handle Stale Session --- (SIMPLIFIED - Deletes Session Only)
  const handleStaleSession = async (staleCartId) => {
    console.log(`[handleStaleSession] Attempting to delete stale session ${staleCartId}`);
    const sessionRef = doc(db, "cartSessions", staleCartId);

    try {
      // Delete the stale Cart Session document
      await deleteDoc(sessionRef);
      console.log(`[handleStaleSession] Successfully deleted stale session ${staleCartId}.`);
      // The listener should now receive a non-existent snapshot.

    } catch (error) {
      console.error(`[handleStaleSession] Failed to delete stale session ${staleCartId}:`, error);
      setError(`Failed to clean up stale session. Please refresh.`);
    }
  };

  // --- Render Logic ---
  // Show activating message first if activation is in progress
  if (isActivating) {
      return <div className="loading-page">Activating Cart...</div>;
  }
  
  // Then handle general loading state
  if (isLoading) {
    return <div className="loading-page">Loading Session...</div>;
  }

  // --- Only proceed if NOT loading AND NOT activating ---

  // Display general errors if session loading failed completely
  // Check error *after* loading/activating checks
  if (error && !sessionData) {
    return <div className="error-page">Error: {error}</div>;
  }

  // If session data is still null after loading/activating finished (e.g., invalid ID, creation failed)
  if (!sessionData) {
      // This case might be covered by the listener setting error, but good fallback.
    return <div className="error-page">Cart session not found or could not be started.</div>;
  }

  // Now determine UI based on status (we know sessionData exists and we're not loading/activating)
  const status = sessionData.status;
  console.log(`[Render] Evaluating render logic. Status: ${status}`, sessionData);

  const requiresDetailsEntry = !status || status === 'pending_details';
  const showShoppingUI = status === 'active' || status === 'checkout_initiated';

  // --- Render Customer Details Form (if needed) ---
  if (requiresDetailsEntry) {
      return (
          <div className="billing-dashboard-page details-entry-page">
              <div className="details-card">
                  <header className="details-header">
                      <h1>Start Shopping</h1>
                      <p>Cart ID: {sessionData.cartDisplayId || cartId}</p>
                  </header>
                  <section className="customer-details-form">
                      <h2>Enter Your Details</h2>
                      <p>Please provide your name and phone number to activate the cart.</p>
                      <form onSubmit={handleDetailsSubmit}>
                          <div className="form-group">
                             <label htmlFor="customerName">Name</label>
                             <input
                                 id="customerName"
                                 type="text"
                                 value={customerName}
                                 onChange={(e) => setCustomerName(e.target.value)}
                                 placeholder="Your Name"
                                 required
                                 className="details-input"
                                 disabled={isSubmittingDetails}
                              />
                          </div>
                           <div className="form-group">
                             <label htmlFor="customerPhone">Phone Number</label>
                             <input
                                 id="customerPhone"
                                 type="tel"
                                 value={customerPhoneNumber}
                                 onChange={(e) => setCustomerPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                 placeholder="10-digit Phone Number"
                                 pattern="\d{10}"
                                 title="Please enter a 10-digit phone number"
                                 maxLength="10"
                                 required
                                 className="details-input"
                                 disabled={isSubmittingDetails}
                             />
                          </div>
                          <button type="submit" className="button button-primary submit-details-button" disabled={isSubmittingDetails}>
                              {isSubmittingDetails ? 'Activating...' : 'Activate Cart'}
                          </button>
                          {detailsError && <p className="error-message details-error">{detailsError}</p>}
                      </form>
                  </section>
              </div>
          </div>
      );
  }

  // --- Render Main Shopping UI (if active) ---
  if (showShoppingUI) {
      const { currentItems = [], currentTotalAmount = 0 } = sessionData;
      const displayPhoneNumber = sessionData.customerPhoneNumber || 'N/A';
      const displayCustomerName = sessionData.customerName || 'Customer';
      const totalItemsCount = currentItems.length;
      const displayBillNumber = provisionalBillNo || 'Generating...';
      
      // Prepare data for BillComponent
      const billDataForComponent = isGeneratingBill || provisionalBillNo ? {
          storeName: storeData?.storeName,
          storeAddress: storeData?.address,
          storeUpiId: storeData?.upiId,
          billNumber: provisionalBillNo,
          cartDisplayId: sessionData?.cartDisplayId,
          customerName: sessionData?.customerName,
          customerPhoneNumber: sessionData?.customerPhoneNumber,
          items: sessionData?.currentItems,
          totalAmount: sessionData?.currentTotalAmount,
          date: new Date().toLocaleString(),
      } : null;

      return (
        <div className="billing-dashboard-page shopping-active-page">
          {/* Render BillComponent off-screen for PDF generation */} 
          <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
              <BillComponent ref={billRef} billData={billDataForComponent} />
          </div>
            
          <header className="billing-header">
            <h1>{storeData?.storeName || 'Shopping Cart'}</h1> 
            <p>Cart ID: {sessionData.cartDisplayId || cartId} | Bill #: {displayBillNumber}</p> 
            <p>Customer: {displayCustomerName} ({displayPhoneNumber})</p>
          </header>

          <div className="shopping-content">
             {/* Scan Section Card */}
              <div className="card scan-card">
                  <section className="scan-section">
                    <h3>Scan Products</h3>
                    {!showScanner && (<button onClick={() => setShowScanner(true)} className="button button-primary scan-toggle-button" disabled={isProcessingScan}>Open Scanner</button>)}
                    {showScanner && (<button onClick={() => setShowScanner(false)} className="button button-secondary scan-toggle-button" disabled={isProcessingScan}>Close Scanner</button>)}
                    <div className={`scanner-container ${!showScanner ? 'hidden' : ''}`}>
                      <div id={qrCodeScannerId} className="barcode-scanner-element"></div>
                      {isProcessingScan && <p className="processing-indicator">Processing Scan...</p>}
                      {scanError && <p className="error-message scan-error">{scanError}</p>}
                    </div>
                  </section>
              </div>

              {/* Items & Summary Sections */} 
              <div className="cart-details">
                  {/* Items List Card */}
                  <div className="card items-card">
                      <section className="billing-items-section">
                          <h2>Items in Cart ({totalItemsCount})</h2>
                          {currentItems.length === 0 ? (<p className="empty-cart-message">Your cart is empty.</p>) : (
                              <ul className="items-list">
                                  {currentItems.map((item, index) => (
                                      <li key={`${item.barcode}-${index}`} className="item-entry">
                                          <span className="item-name">{item.name || 'Item Name Missing'}</span>
                                          <span className="item-price">{formatCurrency(item.price)}</span>
                                      </li>
                                  ))}
                              </ul>
                          )}
                      </section>
                  </div>

                  {/* Summary Card (Update Button State) */} 
                  <div className="card summary-card">
                      <section className="billing-summary-section">
                          <h2>Summary</h2>
                          <div className="summary-details">
                              <p><span>Total Items:</span> <span>{totalItemsCount}</span></p>
                              <p className="total-amount"><span>Total Amount:</span> <span>{formatCurrency(currentTotalAmount)}</span></p>
                          </div>
                          <button onClick={handlePayment} className="button button-success pay-button" 
                              disabled={currentItems.length === 0 || !storeData?.upiId || isProcessingScan || !provisionalBillNo || sessionData.status !== 'active' || isGeneratingBill}>
                              {isGeneratingBill ? 'Generating Bill...' : 
                               sessionData.status === 'checkout_initiated' ? 'Payment Initiated...' : 
                               `Proceed to Pay (${formatCurrency(currentTotalAmount)})`}
                          </button>
                          {!storeData?.upiId && <p className="error-text">Store UPI ID not configured.</p>}
                          {sessionData.status === 'checkout_initiated' && <p className="info-text">Complete payment in your UPI app.</p>}
                      </section>
                  </div>
              </div> 
               {/* Display general errors at the bottom */} 
               {error && <p className="error-message general-error-bottom">{error}</p>} 
          </div> 

        </div>
      );
  }

  // --- Render Fallback/Other Statuses ---
  if (status === 'completed') { return <div className="info-page status-completed">Thank you for shopping! Session completed.</div>; }
  if (status === 'payment_success') { return <div className="info-page status-payment-success">Payment successful! Generating receipt...</div>; }
  if (status === 'error') { return <div className="error-page status-error">An error occurred with this session. Please contact support.</div>; }
  if (status === 'in_use') { return <div className="error-page status-error">This cart is already in use. Please try another cart.</div>; } 

  // Fallback for unknown status
  console.log(`[Render] Reached fallback render. Status: ${status}`);
  return <div className="error-page">Unknown session state: {status || 'N/A'}. Please re-scan the cart QR code.</div>;
};

export default BillingDashboardPage;