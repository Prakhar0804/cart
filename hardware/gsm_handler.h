#ifndef GSM_HANDLER_H
#define GSM_HANDLER_H

#include <Arduino.h>
#if defined(ESP32)
    #include <HardwareSerial.h>
    #include <WString.h>
#else
    #error This code is intended to run on ESP32 platform! Please check your Tools->Board setting.
#endif

class GSMHandler {
private:
    HardwareSerial* gsmSerial;
    String apn;
    bool isConnected = false;
    char incomingChar;
    String currentResponse = "";
    unsigned long responseTimeout = 10000; // 10 seconds timeout

    bool waitForResponse(const char* expected_response, unsigned long timeout = 5000) {
        unsigned long startTime = millis();
        currentResponse = "";
        
        while (millis() - startTime < timeout) {
            while (gsmSerial->available()) {
                incomingChar = gsmSerial->read();
                currentResponse += incomingChar;
                
                if (currentResponse.indexOf(expected_response) != -1) {
                    return true;
                }
            }
            delay(10);
        }
        return false;
    }

    bool sendATCommand(const char* command, const char* expected_response, unsigned int timeout = 2000) {
        gsmSerial->println(command);
        return waitForResponse(expected_response, timeout);
    }

public:
    GSMHandler(HardwareSerial* serial, const char* apnName = "internet") : 
        gsmSerial(serial), apn(apnName) {}

    bool begin() {
        // Wait for module to be ready
        delay(3000);
        
        // Basic AT test
        if (!sendATCommand("AT", "OK")) return false;
        delay(100);
        
        // Text mode for SMS
        if (!sendATCommand("AT+CMGF=1", "OK")) return false;
        delay(100);
        
        // Configure character set
        if (!sendATCommand("AT+CSCS=\"GSM\"", "OK")) return false;
        delay(100);

        // Check network registration
        if (!sendATCommand("AT+CREG?", "+CREG: 0,1")) {
            // Try alternative registration status
            if (!sendATCommand("AT+CREG?", "+CREG: 0,5")) return false;
        }
        delay(100);

        // Configure bearer settings for GPRS
        if (!sendATCommand("AT+SAPBR=3,1,\"Contype\",\"GPRS\"", "OK")) return false;
        delay(100);

        String apn_command = "AT+SAPBR=3,1,\"APN\",\"" + String(apn) + "\"";
        if (!sendATCommand(apn_command.c_str(), "OK")) return false;
        delay(100);

        // Open bearer
        if (!sendATCommand("AT+SAPBR=1,1", "OK")) return false;
        delay(2000);

        // Verify bearer
        if (!sendATCommand("AT+SAPBR=2,1", "+SAPBR: 1,1")) return false;

        isConnected = true;
        return true;
    }

    bool reconnect() {
        // Close bearer
        sendATCommand("AT+SAPBR=0,1", "OK");
        delay(2000);
        isConnected = false;
        return begin();
    }

    bool sendSMS(const char* phoneNumber, const char* message) {
        if (!isConnected) return false;

        // Set SMS mode
        if (!sendATCommand("AT+CMGF=1", "OK")) return false;
        delay(100);

        // Set phone number
        String phoneCmd = "AT+CMGS=\"" + String(phoneNumber) + "\"";
        gsmSerial->println(phoneCmd);
        delay(100);

        // Wait for '>' prompt
        if (!waitForResponse(">", 5000)) return false;

        // Send message content
        gsmSerial->print(message);
        delay(100);
        gsmSerial->write(26); // Ctrl+Z to send

        // Wait for send confirmation
        return waitForResponse("OK", 10000);
    }

    bool isInternetConnected() {
        return isConnected && sendATCommand("AT+SAPBR=2,1", "+SAPBR: 1,1");
    }

    void maintain() {
        if (!isInternetConnected()) {
            isConnected = false;
            reconnect();
        }
    }

    bool checkSignalStrength() {
        if (sendATCommand("AT+CSQ", "+CSQ:")) {
            int signalStart = currentResponse.indexOf("+CSQ: ") + 6;
            int signalEnd = currentResponse.indexOf(",", signalStart);
            if (signalStart > 0 && signalEnd > 0) {
                String signalStr = currentResponse.substring(signalStart, signalEnd);
                int signalStrength = signalStr.toInt();
                return signalStrength > 10; // Values 10-31 are good, 0-9 are poor
            }
        }
        return false;
    }
};

#endif