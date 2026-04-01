// Find our date picker inputs on the page
const startInput = document.getElementById('startDate');
const endInput = document.getElementById('endDate');
const button = document.querySelector('button');
const gallery = document.getElementById('gallery');
const apodModal = document.getElementById('apodModal');
const modalClose = document.querySelector('.modal-close');

// Store reference to the element that triggered the modal (for focus management)
let modalTriggerElement = null;

// Fallback API key for demo purposes (limited requests)
const DEMO_KEY = 'DEMO_KEY';

// Call the setupDateInputs function from dateRange.js
// This sets up the date pickers to:
// - Default to a range of 9 days (from 9 days ago to today)
// - Restrict dates to NASA's image archive (starting from 1995)
setupDateInputs(startInput, endInput);

// Get the user's API key from localStorage or use DEMO_KEY
// Returns: string - API key to use for NASA API requests
function getApiKey() {
  // Check if user has stored their API key
  const userKey = localStorage.getItem('nasaApiKey');
  
  // Validate the key exists and is not empty
  // Use user's key if available, otherwise use DEMO_KEY (limited to 50 requests/hour)
  if (userKey && userKey.trim() !== '') {
    console.log('Using user API key from localStorage.');
    return userKey;
  }
  
  // Fallback to DEMO_KEY if no user key found
  console.warn('No API key found. Using DEMO_KEY (limited requests).');
  return DEMO_KEY;
}

// Fetch APOD data for a single date from NASA's API
// Parameters:
//   date (string) - Date in YYYY-MM-DD format
//   apiKey (string) - NASA API key for authentication
// Returns: Promise<object> - APOD data with date included
// Throws: Error with descriptive message for network/API errors
async function fetchApodData(date, apiKey) {
  try {
    // Construct the API endpoint URL with date and API key parameters
    const url = `https://api.nasa.gov/planetary/apod?api_key=${apiKey}&date=${date}`;
    
    // Make the HTTP request to NASA's servers
    const response = await fetch(url);
    
    // Check if the response status indicates success (200-299)
    if (!response.ok) {
      // Handle different error codes with specific messages
      if (response.status === 400) {
        // Status 400: Invalid date - NASA doesn't have images for this date
        throw new Error(`Invalid date: ${date}. No image available for this date.`);
      } else if (response.status === 429) {
        // Status 429: Too many requests - rate limit exceeded
        throw new Error('Too many requests. Please wait before trying again.');
      } else if (response.status === 403) {
        // Status 403: Forbidden - invalid API key
        throw new Error('Invalid API key. Please check your key in localStorage.');
      }
      // Generic error for other HTTP errors
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    // Convert the response body from JSON string to JavaScript object
    const data = await response.json();
    
    // Add the requested date to the APOD data object for reference
    return { ...data, date };
  } catch (error) {
    // Log the error for debugging purposes
    console.error(`Error fetching data for ${date}:`, error.message);
    // Re-throw the error so the caller can handle it
    throw error;
  }
}

// Fetch APOD data for a date range
// Parameters:
//   startDate (string) - Start date in YYYY-MM-DD format
//   endDate (string) - End date in YYYY-MM-DD format
// Returns: Promise<array> - Array of sanitized APOD objects for the range
// Validates dates are within NASA's archive (1995-06-16 to today)
async function fetchApodRange(startDate, endDate) {
  try {
    // Step 1: Validate input dates using helper function from dateRange.js
    if (!isValidapodDate(startDate)) {
      throw new Error(`Start date (${startDate}) is before June 16, 1995 or in an invalid format.`);
    }
    
    if (!isValidapodDate(endDate)) {
      throw new Error(`End date (${endDate}) is after today or in an invalid format.`);
    }
    
    // Step 2: Ensure logical date order (start <= end)
    if (new Date(startDate) > new Date(endDate)) {
      throw new Error('Start date cannot be after end date.');
    }
    
    // Step 3: Get API key with automatic fallback to DEMO_KEY
    const apiKey = getApiKey();
    
    // Step 4: Generate array of dates to fetch (one per day in range)
    const dates = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    
    // Loop through each day in the range, converting to YYYY-MM-DD format
    while (current <= end) {
      const dateString = current.toISOString().split('T')[0];
      dates.push(dateString);
      current.setDate(current.getDate() + 1);
    }
    
    console.log(`Fetching ${dates.length} images from NASA APOD API...`);
    
    // Step 5: Fetch all dates in parallel using Promise.all for efficiency
    // This is much faster than fetching dates sequentially
    const promises = dates.map(date => fetchApodData(date, apiKey));
    const results = await Promise.all(promises);
    
    // Step 6: Filter out any null or failed results
    const validResults = results.filter(result => result !== null);
    
    // Step 7: Validate and sanitize all APOD data to handle missing fields
    // This prevents crashes from incomplete API responses
    const sanitizedResults = validResults.map(apod => sanitizeApodData(apod));
    
    console.log(`Successfully fetched ${sanitizedResults.length} images`);
    return sanitizedResults;
  } catch (error) {
    // Log the error and re-throw for the caller to handle
    console.error('Error fetching APOD range:', error.message);
    throw error;
  }
}

// Validate and sanitize APOD data to handle missing or null fields
// Parameters:
//   apod (object) - Raw APOD data object from NASA API
// Returns: object - Cleaned APOD object with guaranteed required fields
// This prevents crashes from incomplete API responses
function sanitizeApodData(apod) {
  // Create shallow copy to avoid modifying the original object
  const sanitized = { ...apod };
  
  // Validate and provide defaults for each required field
  
  // Check 1: Title - essential for display
  if (!sanitized.title || sanitized.title.trim() === '') {
    sanitized.title = 'Untitled Image';
    console.warn(`Missing title for ${sanitized.date}, using default.`);
  }
  
  // Check 2: Date - needed for sorting and display
  if (!sanitized.date) {
    sanitized.date = 'Unknown Date';
    console.warn('Missing date in APOD data.');
  }
  
  // Check 3: Explanation - description of the image
  if (!sanitized.explanation || sanitized.explanation.trim() === '') {
    sanitized.explanation = 'No description available for this image.';
    console.warn(`Missing explanation for ${sanitized.date}, using default.`);
  }
  
  // Check 4: Media type - determines how to display content (image vs video)
  if (!sanitized.media_type) {
    sanitized.media_type = 'image';
    console.warn(`Missing media_type for ${sanitized.date}, defaulting to 'image'.`);
  }
  
  // Check 5: URL - the actual image or video to display
  // This is critical - without it we show a placeholder
  if (!sanitized.url || sanitized.url.trim() === '') {
    sanitized.url = null;
    sanitized.hasValidUrl = false;
    console.warn(`Missing URL for ${sanitized.date}, will show placeholder.`);
  } else {
    sanitized.hasValidUrl = true;
  }
  
  return sanitized;
}

// Get placeholder image (SVG as data URL)
function getPlaceholderImageHTML() {
  const placeholderSVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" class="placeholder-image">
      <rect width="300" height="200" fill="#e0e0e0"/>
      <text x="150" y="100" font-size="24" text-anchor="middle" fill="#999">
        Image Not Available
      </text>
    </svg>
  `;
  return placeholderSVG;
}

// Display APOD images in the gallery
// Parameters:
//   apodList (array) - Array of sanitized APOD objects to display
// Side effects: Populates the gallery DOM with gallery items
function displayGallery(apodList) {
  // Clear previous gallery content
  gallery.innerHTML = '';
  
  // Handle case where no images were found
  if (!apodList || apodList.length === 0) {
    gallery.innerHTML = `
      <div class="placeholder">
        <div class="placeholder-icon">📭</div>
        <p>No images found for the selected date range.</p>
      </div>
    `;
    return;
  }
  
  // Create a gallery card for each APOD entry
  apodList.forEach((apod, index) => {
    // Create container for this gallery item
    const item = document.createElement('div');
    item.className = 'gallery-item';
    
    // Determine what media to display (image, video, or placeholder)
    let mediaHTML = '';
    if (apod.media_type === 'video' && apod.hasValidUrl) {
      // For videos with valid URLs, embed an iframe
      mediaHTML = `<iframe src="${apod.url}" class="gallery-image"></iframe>`;
    } else if (apod.hasValidUrl) {
      // For images with valid URLs, use img tag with alt text
      mediaHTML = `<img src="${apod.url}" alt="${apod.title}" class="gallery-image" />`;
    } else {
      // For missing/invalid URLs, display a placeholder SVG
      mediaHTML = `<div class="gallery-image gallery-placeholder">${getPlaceholderImageHTML()}</div>`;
    }
    
    // Prepare description text - truncate to 150 characters
    const description = apod.explanation.substring(0, 150);
    
    // Build the complete gallery item HTML
    item.innerHTML = `
      ${mediaHTML}
      <div class="gallery-info">
        <h3>${apod.title}</h3>
        <p class="gallery-date">${apod.date}</p>
        <p class="gallery-description">${description}${description.length >= 150 ? '...' : ''}</p>
        <button class="more-info-btn" data-index="${index}">More Info</button>
      </div>
    `;
    
    // Add the completed item to the gallery
    gallery.appendChild(item);
    
    // Attach click handler to "More Info" button
    const moreInfoBtn = item.querySelector('.more-info-btn');
    moreInfoBtn.addEventListener('click', () => {
      // Store which button triggered the modal (for focus management)
      modalTriggerElement = moreInfoBtn;
      // Open modal with full APOD details
      openApodModal(apod);
    });
  });
}

// Open the modal and populate it with full APOD details
// Parameters:
//   apod (object) - APOD data object with full information
// Side effects: Opens modal, sets focus, prevents background scrolling
function openApodModal(apod) {
  // Populate modal with APOD data
  document.getElementById('modalTitle').textContent = apod.title;
  document.getElementById('modalDate').textContent = `Date: ${apod.date}`;
  document.getElementById('modalExplanation').textContent = apod.explanation;
  
  // Prepare the image or video container
  const imageContainer = document.getElementById('modalImage');
  imageContainer.innerHTML = '';
  
  // Display media (image, video, or placeholder)
  if (apod.hasValidUrl) {
    if (apod.media_type === 'video') {
      // Embed video in responsive iframe
      const iframe = document.createElement('iframe');
      iframe.src = apod.url;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;
      imageContainer.appendChild(iframe);
    } else {
      // Display image with alt text for accessibility
      const img = document.createElement('img');
      img.src = apod.url;
      img.alt = apod.title;
      imageContainer.appendChild(img);
    }
  } else {
    // Show placeholder when image data is not available
    const placeholder = document.createElement('div');
    placeholder.className = 'modal-placeholder';
    placeholder.innerHTML = `
      ${getPlaceholderImageHTML()}
      <p class="placeholder-message">Image data is not available for this date.</p>
    `;
    imageContainer.appendChild(placeholder);
  }
  
  // Show the modal to the user
  apodModal.classList.add('active');
  // Show the dark overlay via JavaScript-controlled class
  apodModal.classList.add('show-overlay');
  apodModal.setAttribute('aria-hidden', 'false');
  
  // Prevent page from scrolling behind the modal
  document.body.style.overflow = 'hidden';
  document.addEventListener('wheel', preventScroll, { passive: false });
  document.addEventListener('touchmove', preventScroll, { passive: false });
  
  // Set keyboard focus to close button for immediate keyboard access
  modalClose.focus();
}

// Close the modal and restore page interaction
// Side effects: Hides modal, restores scrolling, returns focus to trigger element
function closeApodModal() {
  // Hide the modal visually
  apodModal.classList.remove('active');
  // Hide the dark overlay when modal closes
  apodModal.classList.remove('show-overlay');
  apodModal.setAttribute('aria-hidden', 'true');
  
  // Restore page scrolling
  document.body.style.overflow = 'auto';
  document.removeEventListener('wheel', preventScroll);
  document.removeEventListener('touchmove', preventScroll);
  
  // Return keyboard focus to the element that triggered the modal
  // This helps keyboard and screen reader users stay oriented
  if (modalTriggerElement) {
    modalTriggerElement.focus();
  }
}

// Prevent scrolling while modal is open
// Used to prevent page scroll when modal is displayed
function preventScroll(event) {
  if (apodModal.classList.contains('active')) {
    event.preventDefault();
  }
}

// Close button click handler
// Users can click the × button to dismiss the modal
modalClose.addEventListener('click', closeApodModal);

// Backdrop click handler
// Allow users to close modal by clicking outside the content
apodModal.addEventListener('click', (event) => {
  // Only close if clicking directly on the modal background
  // Don't close if clicking on modal content itself
  if (event.target === apodModal) {
    closeApodModal();
  }
});

// Escape key handler
// Standard keyboard shortcut to close modals (very user-friendly)
document.addEventListener('keydown', (event) => {
  // Only respond to Escape key when modal is actually open
  if (event.key === 'Escape' && apodModal.classList.contains('active')) {
    closeApodModal();
  }
});

// Tab key handler - Focus trapping inside modal
// Ensures keyboard users stay within the modal while it's open
// This improves accessibility by preventing focus from leaving the modal
document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && apodModal.classList.contains('active')) {
    // Get all focusable elements within the modal
    // Includes buttons, links, inputs, and elements with tabindex
    const focusableElements = apodModal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    // If user is on first element and presses Shift+Tab, loop to last element
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    }
    // If user is on last element and presses Tab, loop to first element
    else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }
});

// Main interaction: "Get Space Images" button click handler
// Flow: Validate dates → Fetch APOD data → Display gallery or show error
button.addEventListener('click', async () => {
  try {
    // Disable button to prevent multiple simultaneous requests
    button.disabled = true;
    button.textContent = 'Loading...';
    
    // Fetch APOD data for the selected date range
    // This handles validation, API calls, data sanitization
    const apodData = await fetchApodRange(startInput.value, endInput.value);
    
    // Render the gallery with all fetched images
    displayGallery(apodData);
  } catch (error) {
    // Display user-friendly error message in the gallery area
    gallery.innerHTML = `
      <div class="placeholder">
        <div class="placeholder-icon">⚠️</div>
        <p><strong>Error:</strong> ${error.message}</p>
        <p style="font-size: 0.9em; margin-top: 10px;">
          If you're using DEMO_KEY and see rate limit errors, please add your own NASA API key.
          Get one free at: <a href="https://api.nasa.gov" target="_blank">api.nasa.gov</a>
        </p>
        <p style="font-size: 0.85em; color: #666;">
          To add your key, run in the browser console: <code>localStorage.setItem('nasaApiKey', 'YOUR_KEY')</code>
        </p>
      </div>
    `;
  } finally {
    // Always re-enable the button, whether success or error
    button.disabled = false;
    button.textContent = 'Get Space Images';
  }
});
