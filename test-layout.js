const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    console.log("Starting Puppeteer layout test...");
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Capture and pipe all console logs from the page directly to our terminal
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE EXCEPTION:', err.message));
    page.on('requestfailed', request =>
      console.log('PAGE REQUEST FAILED:', request.url(), request.failure().errorText)
    );

    await page.goto('http://localhost:3000/watermark', { waitUntil: 'networkidle2' });
    
    // Choose the test file
    const fileInput = await page.$('input[type=file]');
    if (!fileInput) {
        console.log("No file input found.");
        await browser.close();
        return;
    }
    const pdfPath = path.resolve(__dirname, 'test.pdf');
    await fileInput.uploadFile(pdfPath);
    
    // Wait for the render
    await new Promise(r => setTimeout(r, 5000));
    
    // Check canvas and canvasDisplaySize state
    const metrics = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        const overlay = document.querySelector('.cursor-grab, .cursor-grabbing');
        return {
            canvasExists: !!c,
            canvasWidth: c ? c.width : null,
            canvasHeight: c ? c.height : null,
            canvasClientWidth: c ? c.clientWidth : null,
            canvasClientHeight: c ? c.clientHeight : null,
            overlayExists: !!overlay,
            overlayStyle: overlay ? overlay.getAttribute('style') : null
        };
    });
    
    console.log('Metrics:', metrics);
    await browser.close();
})();
