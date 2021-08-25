import express from 'express'
import config from 'config'
import mongoose from 'mongoose'
import cors from 'cors'
import { WipoItem } from './models/wipoItem.js'

const app = express()
const port = config.get('PORT')
const mongodbUrl = config.get('MONGODB_URL')
const codes = config.get('CODES')

mongoose.connect(mongodbUrl, { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true })

app.use(express.json())
app.use(cors())
app.post('/api/wipoItems/search', async (req, res) => {
    const { dateFrom, dateTo, office, origin, pageSize, currentPage } = req.body

    console.log(dateFrom, dateTo, office, origin)
    const dateFilter = dateFrom || dateTo ? { "Reg Date": { $gte: dateFrom, $lte: dateTo } } : {}
    const officeFilter = office ? { "Offices": { $in: office } } : {}
    const originFilter = origin ? { "Origin": origin } : {}
    const filter = { ...dateFilter, ...officeFilter, ...originFilter }
    const result = await WipoItem.paginate(filter, { offset: pageSize * (currentPage - 1), limit: pageSize })

    res.send(result)


})
app.get('/api/codes', async (req, res) => {
    res.send(codes)
})


app.listen(port, () => console.log(`listen on port ${port}`))