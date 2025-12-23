const API_URL = 'http://localhost:3001';

async function verifyAuth() {
    try {
        console.log('1. Testing Login...');
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test@example.com',
                password: 'password123'
            })
        });

        const loginData = await loginRes.json();

        if (!loginRes.ok) {
            console.error('❌ Login failed:', loginData);
            // Note: You might need to signup first if user doesn't exist
            console.log('Trying signup instead...');
            await trySignup();
            return;
        }

        if (loginData.access_token && loginData.refresh_token) {
            console.log('✅ Login successful. Tokens received.');
            console.log('Access Token:', loginData.access_token.substring(0, 20) + '...');
        } else {
            console.error('❌ Login failed. No tokens in response.', loginData);
            return;
        }

        const accessToken = loginData.access_token;
        const refreshToken = loginData.refresh_token;

        console.log('\n2. Testing Protected Route (Me)...');
        try {
            const meRes = await fetch(`${API_URL}/auth/me`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const meData = await meRes.json();

            if (meRes.ok) {
                console.log('✅ Protected route accessed successfully.');
                console.log('User:', meData.email);
            } else {
                console.error('❌ Protected route access failed:', meData);
            }

        } catch (e) {
            console.error('❌ Protected route access failed (Error):', e.message);
        }

        console.log('\n3. Testing Refresh Token...');
        try {
            const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken })
            });
            const refreshData = await refreshRes.json();

            if (refreshRes.ok && refreshData.access_token) {
                console.log('✅ Token refresh successful.');
                console.log('New Access Token:', refreshData.access_token.substring(0, 20) + '...');
            } else {
                console.error('❌ Token refresh failed.', refreshData);
            }
        } catch (e) {
            console.error('❌ Token refresh failed (Error):', e.message);
        }

        console.log('\n4. Testing Logout...');
        try {
            const logoutRes = await fetch(`${API_URL}/auth/logout`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (logoutRes.ok) {
                console.log('✅ Logout successful');
            } else {
                console.log('❌ Logout failed', await logoutRes.text());
            }
        } catch (e) {
            console.error('❌ Logout failed (Error):', e.message);
        }

    } catch (error) {
        console.error('❌ Verification script failed:', error.message);
    }
}

async function trySignup() {
    console.log('Attempting Signup...');
    const email = `test${Date.now()}@example.com`;
    try {
        const res = await fetch(`${API_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email,
                password: 'password123',
                firstName: 'Test',
                lastName: 'User'
            })
        });
        const data = await res.json();
        if (res.ok) {
            console.log('✅ Signup successful. Tokens received.');
            console.log('Access Token:', data.access_token.substring(0, 20) + '...');

            // Re-run verify with new tokens? Or just assume it works. 
            // Let's just finish here.
            console.log('Please re-run script with new credentials if you want to test full flow, or update script to use these.');
        } else {
            console.error('❌ Signup failed:', data);
        }
    } catch (e) {
        console.error('❌ Signup failed (error):', e.message);
    }
}

verifyAuth();
