let currentSessionId = null;
let statusCheckInterval = null;

const form = document.getElementById('scrapeForm');
const submitBtn = document.getElementById('submitBtn');
const progressCard = document.getElementById('progressCard');
const resultsCard = document.getElementById('resultsCard');
const errorCard = document.getElementById('errorCard');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');
const statusMessage = document.getElementById('statusMessage');
const resultsList = document.getElementById('resultsList');
const errorMessage = document.getElementById('errorMessage');
const downloadBtn = document.getElementById('downloadBtn');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const listUrl = document.getElementById('listUrl').value;
    const maxItems = parseInt(document.getElementById('maxItems').value) || 200;
    
    // Reset UI
    progressCard.classList.remove('hidden');
    resultsCard.classList.add('hidden');
    errorCard.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-text').textContent = 'Scraping...';
    submitBtn.querySelector('.btn-loader').style.display = 'inline-block';
    
    try {
        const response = await fetch('/api/scrape', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ listUrl, maxItems })
        });
        
        if (!response.ok) {
            throw new Error('Failed to start scraping');
        }
        
        const data = await response.json();
        currentSessionId = data.sessionId;
        
        // Start polling for status
        startStatusPolling();
    } catch (error) {
        showError(error.message);
        resetForm();
    }
});

function startStatusPolling() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
    
    statusCheckInterval = setInterval(async () => {
        if (!currentSessionId) return;
        
        try {
            const response = await fetch(`/api/status/${currentSessionId}`);
            if (!response.ok) {
                throw new Error('Failed to get status');
            }
            
            const status = await response.json();
            updateProgress(status);
            
            if (status.status === 'completed' || status.status === 'error') {
                clearInterval(statusCheckInterval);
                statusCheckInterval = null;
                
                if (status.status === 'completed') {
                    showResults(status.results || []);
                } else {
                    showError(status.error || 'Unknown error occurred');
                }
                
                resetForm();
            }
        } catch (error) {
            console.error('Error checking status:', error);
        }
    }, 1000); // Poll every second
}

function updateProgress(status) {
    const percent = status.total > 0 ? Math.round((status.progress / status.total) * 100) : 0;
    
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `${status.progress} / ${status.total}`;
    progressPercent.textContent = `${percent}%`;
    statusMessage.textContent = status.message || 'Processing...';
}

function showResults(results) {
    resultsCard.classList.remove('hidden');
    resultsList.innerHTML = '';
    
    if (results.length === 0) {
        resultsList.innerHTML = '<p>No results found.</p>';
        return;
    }
    
    results.forEach((place, index) => {
        const item = document.createElement('div');
        item.className = 'result-item';
        item.innerHTML = `
            <h3>${index + 1}. ${place.name || 'Unknown'}</h3>
            ${place.address ? `<p><strong>Address:</strong> ${place.address}</p>` : ''}
            ${place.placeId ? `<p><strong>Place ID:</strong> ${place.placeId}</p>` : ''}
            <p><a href="${place.url}" target="_blank" class="url">${place.url}</a></p>
        `;
        resultsList.appendChild(item);
    });
    
    downloadBtn.onclick = () => {
        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `google_maps_places_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
}

function showError(message) {
    errorCard.classList.remove('hidden');
    errorMessage.textContent = message;
}

function resetForm() {
    submitBtn.disabled = false;
    submitBtn.querySelector('.btn-text').textContent = 'Start Scraping';
    submitBtn.querySelector('.btn-loader').style.display = 'none';
}

