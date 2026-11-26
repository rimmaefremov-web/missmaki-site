const {defineConfig,devices}=require('@playwright/test');
module.exports=defineConfig({testDir:'./tests/browser',testMatch:['optional-pickup.spec.cjs','kitchen.spec.cjs','compat.spec.cjs','ads.spec.cjs','analytics.spec.cjs'],grep:/contacts, persisted kitchen order|lost order response|UUID fallback|technical checkout|missing cryptographic|waiting screen is accessible|kiosk stays on waiting|ads|analytics:/,timeout:45000,workers:1,use:{baseURL:'http://127.0.0.1:4176',serviceWorkers:'block'},projects:[
 {name:'safari-iphone-webkit',use:{...devices['iPhone 13'],browserName:'webkit'}},
 {name:'android-chrome',use:{...devices['Pixel 7'],browserName:'chromium'}},
 {name:'instagram-android-simulated',use:{...devices['Pixel 7'],browserName:'chromium',userAgent:devices['Pixel 7'].userAgent+' Instagram (compatibility test)'}},
 {name:'social-iphone-webkit-simulated',use:{...devices['iPhone 13'],browserName:'webkit',userAgent:devices['iPhone 13'].userAgent+' [FBAN/FBIOS; compatibility test]'}}
],webServer:{command:'python -m http.server 4176 --bind 127.0.0.1',port:4176,reuseExistingServer:false}});
