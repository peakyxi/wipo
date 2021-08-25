import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
puppeteer.use(StealthPlugin())
import queryString from 'query-string'
import config from 'config'
import fs from 'fs'
import sleep from 'sleep-promise'
import { WipoItem } from './models/wipoItem.js'
import mongoose from 'mongoose'



const chromePath = config.get('CHROME_PATH')
const userAgent = config.get('BROWSER_USER_AGENT')
const headless = config.get('CHROME_HEADLESS') === 'true'
const mongodbUrl = config.get('MONGODB_URL')

mongoose.connect(mongodbUrl, { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true })
mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
mongoose.set('useUnifiedTopology', true);

class Wipo {
    constructor(id) {
        return (async () => {
            this.id = id
            this._essentialPageIndex
            this._detailPageIndex
            this.positionDir = 'position'
            this.essentialPositionFile = `${this.positionDir}/essential_${this.id}.json`
            this.detailPositionFile = `${this.positionDir}/detail_${this.id}.json`
            this.pageNumber = null
            await this.init()
            return this
        })()
    }
    init = async () => {
        if (this.browser)
            await this.browser.close()
        this.browser = await puppeteer.launch({ headless: headless, defaultViewport: null, executablePath: chromePath, userAgent })
        const [page] = await this.browser.pages()
        this.page = page
        await this.page.setRequestInterception(true)
        this.page.on('request', (req) => {
            if (this.pageNumber == null) return req.continue()
            if (req.url().match(/jsp\/getData\.jsp/)) {

                const urlObj = new URL(req.url())
                const parsed = queryString.parse(urlObj.search)
                parsed['NO'] = this.pageNumber
                urlObj.search = queryString.stringify(parsed)
                req.continue({ url: urlObj.href })
            } else if (req.url().match(/google|doubleclick|wipoanalytics/)) {
                req.abort()
            } else {
                req.continue()
            }
            this.pageNumber = null
        })
        this.page.on('dialog', async (dialog) => {
            console.log(dialog.message())
            await dialog.dismiss
            throw new Error('Dialog opened Error')
        })
        if (!fs.existsSync(this.positionDir))
            fs.mkdirSync(this.positionDir)
        if (!fs.existsSync(this.essentialPositionFile))
            this.essentialPageIndex = 0
        else {
            const raw = fs.readFileSync(this.essentialPositionFile, { encoding: 'utf8' })
            this.essentialPageIndex = JSON.parse(raw).pageIndex
        }
        if (!fs.existsSync(this.detailPositionFile))
            this.detailPageIndex = 0
        else {
            const raw = fs.readFileSync(this.detailPositionFile, { encoding: 'utf8' })
            this.detailPageIndex = JSON.parse(raw).pageIndex
        }

    }

    set essentialPageIndex(value) {
        this._essentialPageIndex = value
        fs.writeFile(this.essentialPositionFile, JSON.stringify({ pageIndex: value }), (error) => {
            if (error) return console.log(error.message)

        })
    }
    get essentialPageIndex() {
        return this._essentialPageIndex
    }
    set detailPageIndex(value) {
        this._detailPageIndex = value
        fs.writeFile(this.detailPositionFile, JSON.stringify({ pageIndex: value }), (error) => {
            if (error) return console.log(error.message)

        })
    }
    get detailPageIndex() {
        return this._detailPageIndex
    }

    runEssential = async (pageNumbers) => {
        try {
            await this.init()
            return await this._runEssential(pageNumbers)
        } catch (error) {
            console.log(error.message)
            return await this.runEssential(pageNumbers)
        }
    }

    _runEssential = async (pageNumbers) => {
        pageNumbers = pageNumbers.slice(this.essentialPageIndex)
        await this.startWithoutFilterSearch()
        for (const pageNumber of pageNumbers) {
            await this.filpEssentialPage(pageNumber)
            const essentialList = await this.parseEssentialListInfomation()
            this.essentialPageIndex++
            this.writeEssentialList(essentialList)
        }

    }

    writeEssential = (essential) => {

        WipoItem.findOneAndUpdate({ "Reg No": essential["Reg No"] }, essential, { upsert: true }).exec()
    }
    writeEssentialList = (essentialList) => {
        for (const essential of essentialList) {
            this.writeEssential(essential)
        }
    }

    runDetail = async (pageNumbers) => {

        try {
            await this.init()
            return await this._runDetail(pageNumbers)
        } catch (error) {
            console.log(error.message)
            return await this.runDetail(pageNumbers)
        }
    }

    _runDetail = async (pageNumbers) => {
        pageNumbers = pageNumbers.slice(this.detailPageIndex)
        await this.startIntoDetailPage()
        for (const pageNumber of pageNumbers) {
            await this.flipPage(pageNumber)
            const detail = await this.parseDetail()
            this.detailPageIndex++
            this.writeDetail(detail)
        }

    }

    writeDetail = (detail) => {

        WipoItem.findOneAndUpdate({ 'Reg No': detail['Reg No'] }, { ...detail.Category, Offices: detail.Offices }).exec()
    }




    prePareSearchPage = async () => {
        await this.page.goto('https://www3.wipo.int/madrid/monitor/en', { timeout: 90000 })
        await this.page.waitForFunction(() => getComputedStyle(document.querySelector('#search_pane')).backgroundImage === 'none', { timeout: 90000 })
        await this.page.click('a#advancedModeLink')
    }

    // getCountryCodes = async () => {
    //     await this.prePareSearchPage()
    //     await this.page.click('#DS_input')
    //     return await this.page.$$eval('#ui-id-59 > li.ui-menu-item', eles => eles.map(ele => ele.querySelector('b').innerText))
    // }

    // startSearch = async (countryCode) => {
    //     await this.prePareSearchPage()
    //     await this.page.click('#DS_input')
    //     await this.page.waitForSelector('#ui-id-59', { visible: true })
    //     const link = await this.page.evaluateHandle((countryCode) => [...document.querySelectorAll('#ui-id-59 > li.ui-menu-item a')].find(ele => ele.querySelector('b').innerText === countryCode), countryCode)
    //     await link.click()
    //     this.page.click('a.searchButton')
    //     await this.page.waitForFunction(() => {
    //         const ele = document.querySelector('#results_container .ajaxIcon')
    //         return ele && getComputedStyle(ele).backgroundImage === 'none'
    //     })
    //     await this.page.waitForTimeout(3000)
    //     const noMatche = await this.page.$('.noMatches')
    //     if (noMatche) return false
    //     this.page.$eval('#results_container tbody[role="rowgroup"]', group => group.querySelector('tr[id="0"]').click())
    //     await this.page.waitForFunction(() => ![...document.querySelectorAll('#result_pane img')].find(ele => ele.src.match(/ajax-busy-/)))
    //     await this.page.waitForTimeout(3000)
    //     return true
    // }
    startWithoutFilterSearch = async () => {
        await this.prePareSearchPage()
        this.page.click('a.searchButton')
        await this.page.waitForFunction(() => {
            const ele = document.querySelector('#results_container .ajaxIcon')
            return ele && getComputedStyle(ele).backgroundImage === 'none'
        })
        await this.page.waitForTimeout(3000)

    }

    startIntoDetailPage = async () => {
        await this.startWithoutFilterSearch()
        this.page.$eval('#results_container tbody[role="rowgroup"]', group => group.querySelector('tr[id="0"]').click())
        await this.page.waitForFunction(() => ![...document.querySelectorAll('#result_pane img')].find(ele => ele.src.match(/ajax-busy-/)))
        await this.page.waitForTimeout(3000)
    }



    flipPage = async (pageNumber) => {

        this.pageNumber = pageNumber - 1
        await this.page.click('#topDocNext')
        await this.page.waitForFunction(pageNumber => {
            const ele = document.querySelector('.document_position')
            return ele && ele.innerText.replace(/\s\/.+$/, '') == pageNumber
        }, {}, pageNumber)
        await this.page.waitForFunction(() => {
            const ele = document.querySelector('#result_pane > .document_header')
            return ele && ele.firstElementChild.tagName !== 'IMG'
        })
        await this.page.waitForTimeout(1000)
    }


    _waitForRealtime = async (counter = 0) => {

        const realTab = await this.page.evaluateHandle(() => [...document.querySelectorAll('li[role=tab] >a')].find(ele => ele.innerText === 'Real-time Status'))
        realTab.click()
        try {
            await this.page.waitForFunction(() => {
                const ele = document.querySelector('#mrsTab > .fragment-content')
                return ele && ele.firstElementChild && ele.firstElementChild.tagName !== 'IMG'
            }, { timeout: 30000 })
        } catch (error) {
            if (counter > 5)
                throw error
            const detailTab = await this.page.evaluateHandle(() => [...document.querySelectorAll('li[role=tab] >a')].find(ele => ele.innerText === 'Full details'))
            await detailTab.click()
            await this.page.waitForTimeout(1000)
            counter++
            await this._waitForRealtime(counter)
        }

    }

    parseEssentialListInfomation = async () => {
        const headers = await this.page.evaluate(() => [...[...document.querySelectorAll('th')].find(ele => ele.innerText.trim() === 'Trademark')
            .closest('table').querySelectorAll('thead > tr >th')]
            .filter(th => th.style.display !== 'none')
            .slice(1).map(th => th.innerText.replaceAll(".", "").trim()))

        const essentialList = await this.page.evaluate(headers =>
            [...document.querySelectorAll('#gridForsearch_pane > tbody > tr')].slice(1).map(row => {
                const cells = [...row.children].filter(cell => cell.style.display !== 'none').slice(1)
                return cells.reduce((accumulation, cell, i) => {
                    const key = headers[i]
                    const value = cell.innerText
                    accumulation[key] = value
                    return accumulation
                }, {})
            })
            , headers)
        const keyFilteredEssentialList = essentialList.map(item =>
            ['Trademark', 'Status', 'Origin', 'Holder', 'Reg No', 'Reg Date', 'Nice Cl'].reduce((accumulation, fieldKey) => {
                accumulation[fieldKey] = item[fieldKey]
                return accumulation
            }, {})
        )
        return keyFilteredEssentialList.map(essential => {

            essential['Nice Cl'] = essential['Nice Cl'].replace(/\s/g, '').split(',')
            return essential
        })
    }

    getEssentialPageNumbers = async () => {
        const pageNumbersCount = await this.page.$eval('.pageCount', ele => parseInt(ele.innerText.replace(/\/|,|\s/g, '')))
        return [...Array(pageNumbersCount)].map((_, i) => i + 1)
    }
    getEssentialPageNumbersDirect = async () => {
        await this.startWithoutFilterSearch()
        return await this.getEssentialPageNumbers()
    }

    getPageNumbers = async () => {
        const total = await this.page.$eval('.document_position', ele => parseInt(ele.innerText.replace(/^.+\/\s/, '').replaceAll(',', '')))
        return [...Array(total)].map((_, i) => i + 1)

    }
    getDetailPageNumbersDirect = async () => {
        await this.startIntoDetailPage()
        return await this.getPageNumbers()
    }
    filpEssentialPage = async (pageNumber) => {
        await this.page.click('#skipValue1', { clickCount: 2 })
        await this.page.type('#skipValue1', pageNumber.toString())
        await this.page.keyboard.press('Enter')
        await this.page.waitForFunction(() => {
            const ele = document.querySelector('#results_container .ajaxIcon')
            return ele && getComputedStyle(ele).backgroundImage === 'none'
        })
        await this.page.waitForTimeout(1000)
    }

    _parseTransaction = async (countryCode) => {
        const allTransaction = await this.page.$$eval('#fragment-detail > .transaction', rows => rows
            .map(ele => ele.querySelector('div.ligneBox div.text').innerText.replace(/[\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()))

        const showTimesOfSD = allTransaction.filter(txt => txt.startsWith('Subsequent designation') && txt.includes(countryCode)).length

        let lastStatusAfterSD = ''
        if (showTimesOfSD > 0) {
            lastStatusAfterSD = allTransaction.reverse().find(txt => txt.includes(countryCode)).replace(/:.+$/, "").trim()
            if (lastStatusAfterSD === 'Subsequent designation') {
                lastStatusAfterSD = ''
            }
        }
        return { showTimesOfSD, lastStatusAfterSD }
    }
    _parseRealtime = async () => {
        // const realTab = await this.page.evaluateHandle(() => [...document.querySelectorAll('li[role=tab] >a')].find(ele => ele.innerText === 'Real-time Status'))
        // realTab.click()
        // await this.page.waitForFunction(() => {
        //     const ele = document.querySelector('#mrsTab > .fragment-content')
        //     return ele && ele.firstElementChild && ele.firstElementChild.tagName !== 'IMG'
        // }, { timeout: 90000 })
        await this._waitForRealtime()
        await this.page.waitForTimeout(1000)
        const headers = await this.page.evaluate(() => [...[...document.querySelectorAll('th')].find(th => th.innerText.trim() === 'WIPO reference')
            .closest('table').querySelectorAll('thead > tr >th')].map(th => th.innerText.trim()))
        const realtimeData = await this.page.evaluate(headers => [...document.querySelectorAll('table.result  > tbody > tr')].slice(1).map(row => {
            const cells = [...row.children]
            return cells.reduce((accumulation, cell, i) => {
                const key = headers[i]
                const value = cell.innerText
                accumulation[key] = value
                return accumulation
            }, {})

        }), headers)

        const keyFilteredRealtimeData = realtimeData.map(item =>
            ['Type', 'Office', 'Notification date', 'Gazette'].reduce((accumulation, fieldKey) => {
                accumulation[fieldKey] = item[fieldKey]
                return accumulation
            }, {})
        )

        return keyFilteredRealtimeData

    }


    parseDetail = async () => {
        const RegNo = await this.page.$eval('.markname > h2', ele => ele.innerText.replace(/-.+$/, ''))
        const realtimeStatus = await this._parseRealtime()
        const newestRealtimeStatus = realtimeStatus.reduce((accumulation, item, i, origin) => {
            const canSeeMore = origin.map(item => item.Office).includes(item.Office, i + 1)
            if (!canSeeMore)
                accumulation.push(item)
            return accumulation
        }, [])

        const uniqueOffices = newestRealtimeStatus.map(item => item.Office).filter(item => item)

        const NotConcerned = newestRealtimeStatus.filter(item => item.Type === 'Grant of protection' && item.Office)

        const FTpromise = newestRealtimeStatus.filter(item => item.Type === 'Refusal' && item.Office).map(item => {

            return this._parseTransaction(item.Office).then(({ showTimesOfSD, lastStatusAfterSD }) => {
                item['Subsequent Designation Show Times'] = showTimesOfSD
                item['Last Status After SD'] = lastStatusAfterSD
                return item
            })

        })

        const FT = await Promise.all(FTpromise)

        const hasBeenInFTandNC_ContryCode = realtimeStatus.filter(item => ['Refusal', 'Grant of protection']
            .includes(item.Type)).map(item => item.Office)
            .reduce((accumulation, item, i, origin) => {
                const canSeeMore = origin.includes(item, i + 1)
                if (!canSeeMore)
                    accumulation.push(item)
                return accumulation
            }, [])

        const TPG = realtimeStatus.filter(item => !hasBeenInFTandNC_ContryCode.includes(item.Office) && item.Office).sort((item1, item2) => {
            if (item1.Office < item2.Office) return -1
            if (item1.Office > item2.Office) return 1
            return 0
        })


        return { 'Reg No': RegNo, Offices: uniqueOffices, Category: { NotConcerned, FT, TPG } }


    }

    getRegNumbersHasTPG = async () => {
        const itemsHasTPG = await WipoItem.find({ TPG: { $ne: [] } }).select('Reg No')
        return itemsHasTPG.map(item => item['Reg No'])
    }

    _updateByRegNo_search = async () => {
        const regInput = await this.page.evaluate(() => [...document.querySelectorAll('label')].find(ele => ele.innerText === 'Int. Registration').closest('div.inputLine').querySelector('input'))
        await regInput.click({ clickCount: 2 })
        await regInput.type(RegNo, { delay: 100 })
        this.page.click('a.searchButton')
        await this.page.waitForFunction(() => {
            const ele = document.querySelector('#results_container .ajaxIcon')
            return ele && getComputedStyle(ele).backgroundImage === 'none'
        }, { timeout: 90000 })
        await this.page.waitForTimeout(3000)
    }
    _updateByRegNo_parse = async () => {
        this.page.$eval('#results_container tbody[role="rowgroup"]', group => group.querySelector('tr[id="0"]').click())
        await this.page.waitForFunction(() => ![...document.querySelectorAll('#result_pane img')].find(ele => ele.src.match(/ajax-busy-/)), { timeout: 90000 })
        await this.page.waitForTimeout(3000)
        return await this.parseDetail()
    }

    _updateByRegNo_reset = async () => {
        await this.page.click('.backLink > a')
        await this.page.waitForTimeout(1000)
        await this.page.click('#\\#new_search_link > a')
        await this.page.waitForTimeout(500)
    }



    _updateByRegNo = async () => {
        const itemsHasTPG = await this.getRegNumbersHasTPG()
        for (const item of itemsHasTPG) {
            await this._updateByRegNo_search(item)
            await this._updateByRegNo_parse()
            await this._updateByRegNo_reset()
        }
    }


}



export default Wipo