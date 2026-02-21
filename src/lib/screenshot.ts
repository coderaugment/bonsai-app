/**
 * Captures a screenshot of the first live preview iframe found in the DOM
 * Returns a base64 data URL or null if no preview is available
 */
export async function capturePreviewScreenshot(): Promise<{ name: string; type: string; data: string } | null> {
  // Find preview iframe
  const iframe = document.querySelector('iframe[title="Live Preview"]') as HTMLIFrameElement;
  if (!iframe) {
    return null;
  }

  try {
    // Create canvas matching iframe dimensions
    const canvas = document.createElement('canvas');
    const rect = iframe.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Scale for retina displays
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Try to access iframe content (works for same-origin iframes)
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        // Import html2canvas dynamically
        const html2canvas = (await import('html2canvas')).default;

        // Capture iframe content
        const iframeCanvas = await html2canvas(iframeDoc.body, {
          width: rect.width,
          height: rect.height,
          windowWidth: rect.width,
          windowHeight: rect.height,
          scale: window.devicePixelRatio,
          useCORS: true,
          allowTaint: true,
        });

        // Draw captured content to our canvas
        ctx.drawImage(iframeCanvas, 0, 0, rect.width, rect.height);
      } else {
        throw new Error('Cannot access iframe content');
      }
    } catch (crossOriginError) {
      // If iframe is cross-origin, we can't capture it
      console.warn('Cannot capture cross-origin iframe:', crossOriginError);
      return null;
    }

    // Convert canvas to data URL
    const dataUrl = canvas.toDataURL('image/png');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    return {
      name: `preview-screenshot-${timestamp}.png`,
      type: 'image/png',
      data: dataUrl,
    };
  } catch (error) {
    console.error('Failed to capture screenshot:', error);
    return null;
  }
}
