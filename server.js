const express = require('express')
const app = express()
app.use(express.json())

const COOKIE   = process.env.ROBLOX_COOKIE
const GROUP_ID = process.env.GROUP_ID
const SECRET   = process.env.GAME_SECRET

if (!COOKIE || !GROUP_ID || !SECRET) {
    console.error('Missing environment variables')
    process.exit(1)
}

async function getCSRFToken() {
    const res = await fetch('https://auth.roblox.com/v2/logout', {
        method: 'POST',
        headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` }
    })
    return res.headers.get('x-csrf-token')
}

app.get('/health', (_, res) => res.json({ ok: true }))

app.post('/payout', async (req, res) => {
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
        return res.status(500).json({ success: false, error: err })
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message })
    }
})

app.listen(process.env.PORT || 3000, () => console.log('Running!'))