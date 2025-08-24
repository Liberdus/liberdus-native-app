import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './App';

// Register headless task for CallKeep background messaging
// This allows CallKeep to handle incoming calls when the app is killed
AppRegistry.registerHeadlessTask('RNCallKeepBackgroundMessage', () => 
  ({ name, callUUID, handle }) => {
    console.log('📞 CallKeep headless task triggered:', { name, callUUID, handle });
    
    return new Promise((resolve, reject) => {
      try {
        // Import required modules
        const CallKeepService = require('./CallKeepService').default;
        const RNCallKeep = require('react-native-callkeep').default;
        
        const callerName = name || handle || 'Unknown Caller';
        const finalCallUUID = callUUID || require('react-native-uuid').v4();
        
        console.log('🚀 Headless task processing call:', { callerName, finalCallUUID });
        
        // Multiple strategies for headless call handling
        const handleCall = async () => {
          try {
            // Strategy 1: Try CallKeepService
            console.log('🔄 Headless: Attempting CallKeepService approach');
            await CallKeepService.setup();
            CallKeepService.displayIncomingCall(callerName, finalCallUUID);
            console.log('✅ Headless: CallKeepService successful');
            resolve(undefined);
          } catch (serviceError) {
            console.log('⚠️ Headless: CallKeepService failed:', serviceError);
            
            try {
              // Strategy 2: Direct RNCallKeep
              console.log('🔄 Headless: Attempting direct RNCallKeep');
              RNCallKeep.displayIncomingCall(
                finalCallUUID,
                callerName,
                callerName,
                'generic',
                false
              );
              console.log('✅ Headless: Direct RNCallKeep successful');
              resolve(undefined);
            } catch (directError) {
              console.error('❌ Headless: All strategies failed:', directError);
              reject(directError);
            }
          }
        };
        
        // Execute with timeout
        const timeoutId = setTimeout(() => {
          console.error('❌ Headless task timed out');
          reject(new Error('Headless task timeout'));
        }, 10000);
        
        handleCall().finally(() => {
          clearTimeout(timeoutId);
        });
        
      } catch (error) {
        console.error('❌ Headless task error:', error);
        reject(error);
      }
    });
  }
);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
