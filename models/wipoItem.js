import mongoose from 'mongoose'
import mongoosePaginate from 'mongoose-paginate-v2'
const realtimeScheme = new mongoose.Schema({
    "Type": { type: String },
    "Office": { type: String },
    "Notification date": { type: String },
    "Gazette": { type: String }
})
const realtimeSchemaFT = new mongoose.Schema()
realtimeSchemaFT.add(realtimeScheme).add({ "Subsequent Designation Show Times": Number, "Last Status After SD": String })

const schema = new mongoose.Schema({
    "Trademark": { type: String },
    "Status": { type: String },
    "Origin": { type: String },
    "Holder": { type: String },
    "Reg No": { type: String },
    "Reg Date": { type: String },
    "Nice Cl": { type: [String] },
    "NotConcerned": { type: [realtimeScheme] },
    "FT": { type: [realtimeSchemaFT] },
    "TPG": { type: [realtimeScheme] },
    "Offices": { type: [String] }
})
schema.plugin(mongoosePaginate)

const WipoItem = mongoose.model('WipoItem', schema)

export { WipoItem }