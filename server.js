const express = require('express')
const app = express()
app.use(express.json())

const GROUP_ID     = process.env.GROUP_ID
const SECRET       = process.env.GAME_SECRET
const UPDATE_SECRET = process.env.UPDATE_SECRET  // ⚠️ Add this to Render env vars

if (!GROUP_ID || !SECRET) {
    console.error('Missing environment variables')
    process.exit(1)
}

// Cookie stored in memory — refreshed by Chrome extension automatically
let COOKIE = process.env.ROBLOX_COOKIE || ""

async function getCSRFToken() {
    const res = await fetch('https://auth.roblox.com/v2/logout', {
        method: 'POST',
        headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` }
    })
    return res.headers.get('x-csrf-token')
}

// Chrome extension calls this whenever cookie changes
app.post('/update-cookie', (req, res) => {
    if (req.headers['x-update-secret'] !== UPDATE_SECRET) {
        console.warn('Unauthorized cookie update attempt')
        return res.status(401).json({ success: false, error: 'Unauthorized' })
    }

    const { cookie } = req.body
    if (!cookie || cookie.length < 50) {
        return res.status(400).json({ success: false, error: 'Invalid cookie' })
    }

    COOKIE = cookie
    console.log('✅ Cookie updated by Chrome extension at ' + new Date().toISOString())
    res.json({ success: true })
})

// Health check
app.get('/health', (_, res) => res.json({ ok: true, hasCookie: COOKIE.length > 50 }))

// Payout endpoint (unchanged from before)
app.post('/payout', async (req, res) => {
    if (!COOKIE || COOKIE.length < 50) {
        console.error('No valid cookie available')
        return res.status(503).json({ success: false, error: 'Cookie not set — check Chrome extension' })
    }

    if (req.headers['x-game-secret'] !== SECRET) {
        return res.status(401).json({ success: false, error: 'Unauthorized' })
    }

    const { userId, amount } = req.body
    if (!userId || !amount || isNaN(amount) || Number(amount) < 1) {
        return res.status(400).json({ success: false, error: 'Bad params' })
    }

    try {
        const token = await getCSRFToken()
        const response = await fetch(
            `https://groups.roblox.com/v1/groups/${GROUP_ID}/payouts`,
            {
                method: 'POST',
                headers: {
                    Cookie: `.ROBLOSECURITY=${COOKIE}`,
                    'X-CSRF-TOKEN': token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    PayoutType: 'FixedAmount',
                    Recipients: [{
                        recipientId: parseInt(userId),
                        recipientType: 'User',
                        amount: Math.floor(Number(amount))
                    }]
                })
            }
        )

        if (response.ok) {
            console.log(`Paid ${amount}R$ to ${userId}`)
            return res.json({ success: true })
        }

        const err = await response.text()
        console.error(`Payout failed: ${err}`)
        return res.status(500).json({ success: false, error: err })

    } catch (e) {
        return res.status(500).json({ success: false, error: e.message })
    }
})

app.listen(process.env.PORT || 3000, () => console.log('Running ✅'))