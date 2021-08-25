import config from 'config'
import sleep from 'sleep-promise'
import Wipo from './wipo.js'
import { spliceIntoChunks } from './utilities.js'
const threadsNumber = config.get('WIPO_THREADS_NUMBER')
process.setMaxListeners(0);




async function getDetailPageNumbersDirect() {
    const wipo = await new Wipo()
    const allPageNumbers = await wipo.getDetailPageNumbersDirect()
    await wipo.browser.close()
    return allPageNumbers
}

(async () => {

    const allPageNumbers = await getDetailPageNumbersDirect()
    const chunkSize = allPageNumbers.length / threadsNumber
    const pageNumbersChunks = spliceIntoChunks(allPageNumbers, chunkSize)
    console.log(pageNumbersChunks)
    for (const [i, pageNumbers] of pageNumbersChunks.entries()) {
        const wipoPromise = new Wipo(i)
        await sleep(6000)
        wipoPromise.then(wipo => {

            wipo.runDetail(pageNumbers)
                .then(() => console.log('Done'))

        })
    }

})();