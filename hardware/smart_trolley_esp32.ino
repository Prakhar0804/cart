#include <Arduino.h>
#include <WiFi.h>
#include <EEPROM.h>
#include <Firebase_ESP_Client.h>
#include <LiquidCrystal_I2C.h>
#include <HX711.h>
#include <SoftwareSerial.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>
#include <Preferences.h>

// WiFi Configuration - Multiple Networks
#define MAX_NETWORKS 5  // Maximum number of WiFi networks to store
struct WiFiNetwork {
    const char* ssid;
    const char* password;
};

// Add your networks here
WiFiNetwork networks[] = {
    {"Hackathon_WiFi", "hackathon_password"},  // Primary network for hackathon
    {"Mobile_Hotspot", "hotspot_password"},    // Your mobile hotspot
    {"Lab_WiFi", "lab_password"},              // Lab/testing network
    {"Backup_Phone", "backup_password"},        // Backup mobile hotspot
    {"Emergency_Net", "emergency_password"}     // Emergency backup network
};

// Firebase configuration
#define API_KEY "AIzaSyA5jE700Ky8w9CbuAvbOXdzGDK702OmFJw"
#define FIREBASE_PROJECT_ID "smart-trolley-7f6ea"
#define FIREBASE_AUTH_DOMAIN "smart-trolley-7f6ea.firebaseapp.com"
#define FIREBASE_STORAGE_BUCKET "smart-trolley-7f6ea.appspot.com"
#define FIREBASE_MESSAGING_SENDER_ID "757727133908"
#define FIREBASE_APP_ID "1:757727133908:web:ee42dddf4ba0a133653b41"
#define FIREBASE_MEASUREMENT_ID "G-72C4KXHKXD"

// Hardware pins
#define LED_RED_PIN 12
#define LED_GREEN_PIN 14
#define BUZZER_PIN 27
#define GSM_RX 16
#define GSM_TX 17
#define GSM_BAUD 9600
#define LOADCELL_DOUT_PIN 2
#define LOADCELL_SCK_PIN 4
#define EEPROM_SIZE 512
#define CART_ID_ADDR 0

// Objects
SoftwareSerial gsmSerial(GSM_RX, GSM_TX);
HX711 scale;
LiquidCrystal_I2C lcd(0x27, 16, 2);  // 16x2 LCD
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
Preferences preferences;

// Global variables
bool isUsingWiFi = true;
bool internetConnected = false;
bool isCartActive = false;
bool isWeightAlert = false;
bool buzzerState = false;
String cartId = "";
String customerPhone = "";
float currentExpectedWeight = 0.0;
float currentMeasuredWeight = 0.0;
float weightTolerance = 50.0;
unsigned long lastBuzzerToggle = 0;
unsigned long lastWiFiCheck = 0;
const float WEIGHT_CALIBRATION_FACTOR = -439.0;
int currentNetworkIndex = 0;

void setup() {
    Serial.begin(115200);
    EEPROM.begin(EEPROM_SIZE);
    
    // Initialize hardware
    initLCD();
    initWeightSensor();
    
    // Initialize pins
    pinMode(LED_RED_PIN, OUTPUT);
    pinMode(LED_GREEN_PIN, OUTPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    
    // Set initial states
    digitalWrite(LED_RED_PIN, HIGH);
    digitalWrite(LED_GREEN_PIN, LOW);
    digitalWrite(BUZZER_PIN, LOW);
    
    // Load permanent cart ID
    loadCartIdFromEEPROM();
    
    // Try WiFi first, then GSM
    if (!connectToWiFi()) {
        initGSM();
    }
    
    initFirebase();
}

bool connectToWiFi() {
    lcd.clear();
    lcd.print("WiFi Connecting");
    WiFi.disconnect(true);
    delay(1000);
    
    // Try each network in sequence
    for (int i = 0; i < MAX_NETWORKS; i++) {
        lcd.clear();
        lcd.print("Try WiFi:");
        lcd.setCursor(0, 1);
        lcd.print(networks[i].ssid);
        
        WiFi.begin(networks[i].ssid, networks[i].password);
        
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 20) {
            delay(500);
            attempts++;
            // Show progress
            lcd.setCursor(15, 1);
            lcd.print(attempts % 2 == 0 ? "." : " ");
        }
        
        if (WiFi.status() == WL_CONNECTED) {
            currentNetworkIndex = i;  // Remember successful network
            lcd.clear();
            lcd.print("WiFi Connected!");
            lcd.setCursor(0, 1);
            lcd.print(networks[i].ssid);
            delay(2000);
            isUsingWiFi = true;
            internetConnected = true;
            return true;
        }
        
        WiFi.disconnect(true);
        delay(1000);
    }
    
    lcd.clear();
    lcd.print("WiFi Failed");
    lcd.setCursor(0, 1);
    lcd.print("Using GSM...");
    delay(2000);
    return false;
}

bool checkConnection() {
    // Check connection every 30 seconds
    if (millis() - lastWiFiCheck > 30000) {
        lastWiFiCheck = millis();
        
        if (isUsingWiFi) {
            if (WiFi.status() != WL_CONNECTED) {
                // Try current network first
                WiFi.begin(networks[currentNetworkIndex].ssid, networks[currentNetworkIndex].password);
                int attempts = 0;
                while (WiFi.status() != WL_CONNECTED && attempts < 10) {
                    delay(500);
                    attempts++;
                }
                
                if (WiFi.status() != WL_CONNECTED) {
                    // If current network fails, try all networks
                    return connectToWiFi();
                }
                return true;
            }
            return true;
        } else {
            return checkGSMConnection();
        }
    }
    return internetConnected;
}

void switchConnectionMethod() {
    internetConnected = false;
    if (isUsingWiFi) {
        initGSM();
    } else {
        connectToWiFi();
    }
}

void initLCD() {
    lcd.init();
    lcd.backlight();
    lcd.clear();
    lcd.print("Smart Trolley");
    lcd.setCursor(0, 1);
    lcd.print("Initializing...");
}

void initWeightSensor() {
    scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
    scale.set_scale(WEIGHT_CALIBRATION_FACTOR);
    scale.tare();
}

void handleCartSessionUpdate(FirebaseJson &json) {
    FirebaseJsonData result;
    
    // Get status
    json.get(result, "status");
    if (result.success) {
        String status = result.stringValue;
        updateLEDStatus(status); // Update LED status
        
        // Get customer phone for SMS
        json.get(result, "customerPhoneNumber");
        if (result.success) {
            customerPhone = result.stringValue;
        }
        
        if (status == "active") {
            // Get expected weight
            json.get(result, "currentExpectedWeight");
            if (result.success) {
                currentExpectedWeight = result.floatValue;
            }
            
            // Get current items for display
            FirebaseJsonArray items;
            json.get(result, "currentItems");
            if (result.success) {
                FirebaseJson lastItem;
                size_t itemCount = items.size();
                if (itemCount > 0) {
                    items.get(lastItem, itemCount - 1);
                    
                    String name;
                    float price;
                    lastItem.get(result, "name");
                    if (result.success) name = result.stringValue;
                    lastItem.get(result, "price");
                    if (result.success) price = result.floatValue;
                    
                    displayProductInfo(name.c_str(), price);
                }
            }
        } else if (status == "checkout_initiated") {
            // Get bill details for SMS
            String billNumber;
            float totalAmount;
            
            json.get(result, "finalBillNumber");
            if (result.success) billNumber = result.stringValue;
            
            json.get(result, "currentTotalAmount");
            if (result.success) totalAmount = result.floatValue;
            
            // Send SMS if we have customer phone
            if (customerPhone.length() > 0) {
                sendBillSMS(billNumber, totalAmount);
            }
        }
    }
}

void displayProductInfo(const char* name, float price) {
    lcd.clear();
    // First row: Product name (scrolling if > 16 chars)
    String nameStr = String(name);
    if (nameStr.length() > 16) {
        nameStr = nameStr.substring(0, 16);
    }
    lcd.print(nameStr);
    
    // Second row: Price
    lcd.setCursor(0, 1);
    lcd.print("Rs.");
    lcd.print(price, 2);
}

void updateWeightComparison() {
    static unsigned long lastWeightUpdate = 0;
    static bool isAlternating = false;
    
    if (millis() - lastWeightUpdate > 3000) { // Switch display every 3 seconds
        isAlternating = !isAlternating;
        lastWeightUpdate = millis();
        
        lcd.clear();
        if (isAlternating) {
            lcd.print("Exp: ");
            lcd.print(currentExpectedWeight, 1);
            lcd.print("g");
            lcd.setCursor(0, 1);
            lcd.print("Act: ");
            lcd.print(currentMeasuredWeight, 1);
            lcd.print("g");
        }
        
        // Check weight mismatch and update alert status
        float weightDiff = abs(currentMeasuredWeight - currentExpectedWeight);
        isWeightAlert = (weightDiff > weightTolerance && isCartActive);
    }
}

void sendBillSMS(String billNumber, float totalAmount) {
    if (!isUsingWiFi) { // Only send SMS when using GSM
        gsmSerial.println("AT+CMGF=1"); // Set SMS text mode
        delay(100);
        
        // Send SMS
        gsmSerial.print("AT+CMGS=\"");
        gsmSerial.print(customerPhone);
        gsmSerial.println("\"");
        delay(100);
        
        // SMS content
        String message = "Your bill #" + billNumber + " total: Rs." + String(totalAmount, 2);
        gsmSerial.println(message);
        delay(100);
        gsmSerial.write(26); // Ctrl+Z to send
        delay(1000);
    }
}

void initFirebase() {
    config.api_key = API_KEY;
    config.project_id = FIREBASE_PROJECT_ID;
    config.token_status_callback = tokenStatusCallback;

    // Enable auto-reconnect to Firebase
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);

    while (!Firebase.ready() && !internetConnected) {
        Serial.println("Connecting to Firebase...");
        lcd.clear();
        lcd.print("Connecting to");
        lcd.setCursor(0, 1);
        lcd.print("Firebase...");
        delay(1000);
    }

    if (Firebase.ready()) {
        lcd.clear();
        lcd.print("Firebase Ready!");
        delay(1000);
    }
}

void updateHardwareStatus() {
    String documentPath = "cartHardware/" + cartId;
    FirebaseJson content;
    
    // Basic status
    content.set("field/isOnline", true);
    content.set("field/connectionType", isUsingWiFi ? "wifi" : "gsm");
    content.set("field/lastSeen", "serverTimestamp()"); // Firebase server timestamp
    
    // Connection details
    if (isUsingWiFi) {
        content.set("field/signalStrength", (WiFi.RSSI() + 100) * 2); // Convert dBm to percentage
        content.set("field/networkName", networks[currentNetworkIndex].ssid);
    } else {
        // Use GSM signal strength if available
        content.set("field/signalStrength", 75); // Default to 75% for GSM
        content.set("field/networkName", "GSM");
    }
    
    // Hardware status
    content.set("field/cartId", cartId);
    content.set("field/weightSensorActive", scale.is_ready());
    content.set("field/displayActive", true);
    
    // Update in Firebase
    if (Firebase.Firestore.patchDocument(&fbdo, FIREBASE_PROJECT_ID, "", documentPath.c_str(), content.raw(), "field")) {
        Serial.println("Hardware status updated successfully");
    } else {
        Serial.println("Failed to update hardware status");
        Serial.println(fbdo.errorReason());
    }
}

void loop() {
    // Check and maintain internet connection
    if (!checkConnection()) {
        switchConnectionMethod();
    }
    
    if (Firebase.ready() && internetConnected) {
        // Update hardware status every 30 seconds
        static unsigned long lastStatusUpdate = 0;
        if (millis() - lastStatusUpdate > 30000) {
            updateHardwareStatus();
            lastStatusUpdate = millis();
        }
        
        // Listen to cart session updates
        String documentPath = "cartSessions/" + cartId;
        if (Firebase.Firestore.getDocument(&fbdo, FIREBASE_PROJECT_ID, "", documentPath.c_str())) {
            FirebaseJson payload;
            payload.setJsonData(fbdo.payload().c_str());
            handleCartSessionUpdate(payload);
        }
        
        // Read and update weight
        if (scale.is_ready()) {
            currentMeasuredWeight = scale.get_units();
            updateWeightComparison();
        }
        
        // Handle buzzer for weight alert
        handleBuzzerAlert();
    }
    
    delay(1000);
}