import { useEffect, useMemo, useState } from 'react'

const uid = () => Math.random().toString(36).slice(2, 10)
const LOGO_URL = 'https://belimprint.com/wp-content/uploads/2026/06/Logo-B-ELi-M-Stamparija-crni.png'
const parseNum = (value) => {
  const number = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(number) ? number : 0
}
const money = (value) => new Intl.NumberFormat('bs-BA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0) + ' KM'
const number = (value, digits = 3) => new Intl.NumberFormat('bs-BA', { maximumFractionDigits: digits }).format(value || 0)

const ITEM_TEMPLATES = [
  ['Papir', 'arak', 'KM / arku'],
  ['Boja', 'kg', 'KM / kg'],
  ['Offsetin', 'l', 'KM / jedinici'],
  ['Folija za zlatotisak', 'm', 'KM / jedinici'],
  ['Big linije', 'kom', 'KM / kom'],
  ['Alat', 'kom', 'KM / alatu'],
  ['Folija za plastificiranje', 'm', 'KM / m'],
  ['UV lak', 'kg', 'KM / kg'],
  ['Rezanje / sječenje', 'sat', 'KM / jedinici'],
  ['Lijepljenje / montaža', 'kom', 'KM / jedinici'],
  ['Suhi žig / reljefni tisak', 'kom', 'KM / jedinici'],
  ['Laminacija mat / sjaj', 'm', 'KM / m'],
  ['Transport / dostava', 'usluga', 'KM / jedinici'],
  ['Rad mašine / radna snaga', 'sat', 'KM / satu'],
  ['Pakovanje', 'kom', 'KM / jedinici'],
]
const makeItems = () => ITEM_TEMPLATES.map(([name, unit, priceLabel]) => ({ id: uid(), name, quantity: '', unit, price: '', priceLabel }))
const makeProduct = (index = 1) => ({
  id: uid(), name: `Proizvod ${index}`, description: '', quantity: '', wastePercent: '', items: makeItems(),
  customItems: [], pricingMode: 'margin', margin: '20', manualUnitPrice: '',
})
const initialOffer = () => ({
  offerNumber: `P-${new Date().getFullYear()}-001`, date: new Date().toISOString().slice(0, 10), validDays: '15',
  client: '', clientAddress: '', contact: '', note: 'Hvala na ukazanom povjerenju.', discount: '', vatEnabled: true,
  products: [makeProduct()],
})

function Field({ label, value, onChange, placeholder, type = 'text', className = '' }) {
  return <label className={`field ${className}`}><span>{label}</span><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /></label>
}

function App() {
  const [offer, setOffer] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gameha-offer')) || initialOffer() } catch { return initialOffer() }
  })
  const [saved, setSaved] = useState(false)
  const [archive, setArchive] = useState([])
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState('calculator')
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => { setMenuOpen(false) }, [view])

  const loadArchive = async (term = '') => {
    setArchiveLoading(true); setArchiveError('')
    try {
      const res = await fetch(`/api/offers${term ? `?search=${encodeURIComponent(term)}` : ''}`)
      if (!res.ok) {
        let serverMsg = ''
        try { serverMsg = (await res.json()).error } catch {}
        throw new Error(serverMsg || `Greška servera (${res.status})`)
      }
      setArchive(await res.json())
    } catch (err) {
      setArchiveError(err.message?.includes('fetch') ? 'Nije moguće učitati sačuvane ponude. Ova funkcija radi na objavljenom (Live) sajtu, ne u sandbox pregledu.' : err.message)
    } finally {
      setArchiveLoading(false)
    }
  }

  useEffect(() => {
    if (view === 'archive') loadArchive(search)
  }, [view])

  useEffect(() => {
    if (view !== 'archive') return
    const timer = setTimeout(() => loadArchive(search), 350)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('gameha-offer', JSON.stringify(offer)); setSaved(true)
      setTimeout(() => setSaved(false), 1200)
    }, 350)
    return () => clearTimeout(timer)
  }, [offer])

  const updateOffer = (key, value) => setOffer(prev => ({ ...prev, [key]: value }))
  const updateProduct = (id, key, value) => setOffer(prev => ({ ...prev, products: prev.products.map(p => p.id === id ? { ...p, [key]: value } : p) }))
  const updateItem = (productId, itemId, key, value, custom = false) => setOffer(prev => ({ ...prev, products: prev.products.map(p => {
    if (p.id !== productId) return p
    const listKey = custom ? 'customItems' : 'items'
    return { ...p, [listKey]: p[listKey].map(i => i.id === itemId ? { ...i, [key]: value } : i) }
  }) }))

  const productTotals = useMemo(() => offer.products.map(p => {
    const base = [...p.items, ...p.customItems].reduce((sum, i) => sum + parseNum(i.quantity) * parseNum(i.price), 0)
    const cost = base * (1 + parseNum(p.wastePercent) / 100)
    const qty = Math.max(parseNum(p.quantity), 0)
    const costUnit = qty ? cost / qty : 0
    const saleUnit = p.pricingMode === 'manual' ? parseNum(p.manualUnitPrice) : costUnit * (1 + parseNum(p.margin) / 100)
    const saleTotal = saleUnit * qty
    const profit = saleTotal - cost
    const actualMargin = cost ? (profit / cost) * 100 : 0
    return { id: p.id, base, cost, qty, costUnit, saleUnit, saleTotal, profit, actualMargin }
  }), [offer.products])

  const subtotal = productTotals.reduce((s, p) => s + p.saleTotal, 0)
  const discountAmount = subtotal * parseNum(offer.discount) / 100
  const afterDiscount = subtotal - discountAmount
  const vat = offer.vatEnabled ? afterDiscount * 0.17 : 0
  const grandTotal = afterDiscount + vat
  const totalCost = productTotals.reduce((s, p) => s + p.cost, 0)
  const finalProfit = afterDiscount - totalCost

  const addProduct = () => setOffer(prev => ({ ...prev, products: [...prev.products, makeProduct(prev.products.length + 1)] }))
  const duplicateProduct = (product) => setOffer(prev => ({ ...prev, products: [...prev.products, { ...product, id: uid(), name: `${product.name} — kopija`, items: product.items.map(i => ({ ...i, id: uid() })), customItems: product.customItems.map(i => ({ ...i, id: uid() })) }] }))
  const removeProduct = (id) => {
    if (offer.products.length === 1 || !confirm('Obrisati ovaj proizvod iz ponude?')) return
    setOffer(prev => ({ ...prev, products: prev.products.filter(p => p.id !== id) }))
  }
  const addCustomItem = (productId) => setOffer(prev => ({ ...prev, products: prev.products.map(p => p.id === productId ? { ...p, customItems: [...p.customItems, { id: uid(), name: 'Ostalo', quantity: '', unit: 'kom', price: '', priceLabel: 'KM / jedinici' }] } : p) }))
  const removeCustomItem = (productId, itemId) => setOffer(prev => ({ ...prev, products: prev.products.map(p => p.id === productId ? { ...p, customItems: p.customItems.filter(i => i.id !== itemId) } : p) }))
  const reset = () => { if (confirm('Očistiti cijelu kalkulaciju?')) { setOffer(initialOffer()); setEditingId(null); setView('calculator') } }
  const saveOffer = async () => {
    setSaving(true)
    try {
      const method = editingId ? 'PUT' : 'POST'
      const url = editingId ? `/api/offers/${editingId}` : '/api/offers'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offer, grandTotal }) })
      if (!res.ok) {
        let serverMsg = ''
        try { serverMsg = (await res.json()).error } catch {}
        throw new Error(serverMsg || `Greška servera (${res.status})`)
      }
      const saved = await res.json()
      setEditingId(saved.id)
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch (err) {
      alert(err.message?.includes('fetch') ? 'Nije moguće sačuvati ponudu u bazu. Ova funkcija radi na objavljenom (Live) sajtu, ne u sandbox pregledu.' : `Greška pri čuvanju: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }
  const openSavedOffer = (entry) => {
    setOffer(JSON.parse(JSON.stringify(entry.data)))
    setEditingId(entry.id)
    setView('calculator')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const deleteSavedOffer = async (id) => {
    if (!confirm('Trajno obrisati ovu sačuvanu ponudu?')) return
    try {
      const res = await fetch(`/api/offers/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error('Greška servera')
      if (editingId === id) setEditingId(null)
      loadArchive(search)
    } catch (err) {
      alert('Nije moguće obrisati ponudu.')
    }
  }

  return <div className="app-shell">
    <header className="topbar no-print">
      <button className="brand brand-button" onClick={() => setView('calculator')}><img src={LOGO_URL} alt="Belim štamparija" /><span>Kalkulacije za štampariju</span></button>
      <div className="header-actions"><span className={`save-state ${saved ? 'show' : ''}`}>✓ Sačuvano</span><button className={`btn ghost ${view === 'archive' ? 'active-nav' : ''}`} onClick={() => setView('archive')}>Sačuvane ponude</button><button className="btn ghost" onClick={reset}>Nova kalkulacija</button>{view === 'calculator' && <><button className="btn dark" disabled={saving} onClick={saveOffer}>{saving ? 'Čuvanje...' : editingId ? 'Ažuriraj ponudu' : 'Sačuvaj ponudu'}</button><button className="btn primary" onClick={() => window.print()}>Štampaj / PDF</button></>}</div>
      <button className="burger-btn" aria-label="Meni" onClick={() => setMenuOpen(o => !o)}><span /><span /><span /></button>
    </header>
    {menuOpen && <div className="mobile-menu-backdrop" onClick={() => setMenuOpen(false)}>
      <div className="mobile-menu" onClick={e => e.stopPropagation()}>
        <button className={`mobile-menu-item ${view === 'archive' ? 'active-nav' : ''}`} onClick={() => { setView('archive'); setMenuOpen(false) }}>📁 Sačuvane ponude</button>
        <button className="mobile-menu-item" onClick={() => { reset(); setMenuOpen(false) }}>＋ Nova kalkulacija</button>
        {view === 'calculator' && <>
          <button className="mobile-menu-item primary" disabled={saving} onClick={() => { saveOffer(); setMenuOpen(false) }}>{saving ? 'Čuvanje...' : editingId ? '✓ Ažuriraj ponudu' : '✓ Sačuvaj ponudu'}</button>
          <button className="mobile-menu-item" onClick={() => { setMenuOpen(false); window.print() }}>🖶 Štampaj / PDF</button>
        </>}
      </div>
    </div>}

    <main className="workspace no-print">
      {view === 'archive' ? <section className="archive-view">
        <div className="archive-header"><div><p className="eyebrow">ARHIVA</p><h1>Sačuvane ponude</h1><p>Otvorite raniju ponudu, pregledajte je ili nastavite uređivanje.</p></div><button className="btn dark" onClick={reset}>＋ Nova ponuda</button></div>
        <div className="archive-search"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pretraga po klijentu, broju ponude ili proizvodu..." />{search && <button className="clear-search" onClick={() => setSearch('')}>×</button>}</div>
        {archiveLoading && <div className="card empty-archive"><strong>Učitavanje...</strong></div>}
        {!archiveLoading && archiveError && <div className="card empty-archive archive-error"><strong>⚠ Greška</strong><p>{archiveError}</p><button className="btn ghost" onClick={() => loadArchive(search)}>Pokušaj ponovo</button></div>}
        {!archiveLoading && !archiveError && archive.length === 0 && <div className="card empty-archive"><strong>{search ? 'Nema rezultata za pretragu' : 'Još nema sačuvanih ponuda'}</strong><p>{search ? 'Pokušajte s drugim pojmom pretrage.' : 'Kada završite kalkulaciju, kliknite „Sačuvaj ponudu“.'}</p>{!search && <button className="btn primary" onClick={() => setView('calculator')}>Napravi prvu ponudu</button>}</div>}
        {!archiveLoading && !archiveError && archive.length > 0 && <div className="archive-list">{archive.map(entry => <article className="card archive-item" key={entry.id}>
          <div className="archive-main"><span className="archive-number">{entry.offer_number || 'Bez broja'}</span><h2>{entry.client_name || 'Klijent nije unesen'}</h2><p>{entry.product_names || 'Bez proizvoda'}</p><small>Sačuvano: {new Date(entry.updated_at || entry.created_at).toLocaleString('bs-BA')}</small></div>
          <div className="archive-price"><span>Ukupna ponuda</span><strong>{money(entry.grand_total)}</strong><small>{entry.data?.products?.length || 0} {entry.data?.products?.length === 1 ? 'proizvod' : 'proizvoda'}</small></div>
          <div className="archive-actions"><button className="btn dark" onClick={() => openSavedOffer(entry)}>Otvori / uredi</button><button className="btn danger-btn" onClick={() => deleteSavedOffer(entry.id)}>Obriši</button></div>
        </article>)}</div>}
      </section> : <>
      {editingId && <div className="editing-banner">✎ Uređujete sačuvanu ponudu. Klik na „Ažuriraj ponudu“ sprema izmjene, ili pravite novu.<button onClick={() => setEditingId(null)}>Napravi kao novu ponudu</button></div>}
      <section className="hero">
        <div><p className="eyebrow">INTERNA KALKULACIJA</p><h1>{editingId ? 'Izmjena ponude' : 'Nova ponuda'}</h1><p>Unesite troškove, postavite maržu i pripremite profesionalnu ponudu za klijenta.</p></div>
        <div className="total-pill"><span>Ukupno s PDV-om</span><strong>{money(grandTotal)}</strong></div>
      </section>

      <section className="card offer-data">
        <div className="section-heading"><div><span className="step">01</span><div><h2>Podaci ponude</h2><p>Osnovne informacije za dokument</p></div></div></div>
        <div className="form-grid">
          <Field label="Broj ponude" value={offer.offerNumber} onChange={v => updateOffer('offerNumber', v)} />
          <Field label="Datum" type="date" value={offer.date} onChange={v => updateOffer('date', v)} />
          <Field label="Ponuda važi (dana)" type="number" value={offer.validDays} onChange={v => updateOffer('validDays', v)} />
          <Field label="Naziv klijenta" value={offer.client} onChange={v => updateOffer('client', v)} placeholder="Naziv firme ili osobe" />
          <Field label="Adresa klijenta" value={offer.clientAddress} onChange={v => updateOffer('clientAddress', v)} placeholder="Adresa" />
          <Field label="Kontakt" value={offer.contact} onChange={v => updateOffer('contact', v)} placeholder="Telefon ili e-mail" />
        </div>
      </section>

      <div className="products-head"><div><p className="eyebrow">STAVKE PONUDE</p><h2>Proizvodi i kalkulacije</h2></div><button className="btn dark" onClick={addProduct}>＋ Dodaj proizvod</button></div>

      {offer.products.map((product, productIndex) => {
        const totals = productTotals[productIndex]
        return <section className="card product-card" key={product.id}>
          <div className="product-titlebar">
            <div className="product-number">{String(productIndex + 1).padStart(2, '0')}</div>
            <div className="product-name-fields"><Field label="Naziv proizvoda" value={product.name} onChange={v => updateProduct(product.id, 'name', v)} placeholder="npr. Kutija za baklavu 500 g" /><Field label="Količina (kom)" type="number" value={product.quantity} onChange={v => updateProduct(product.id, 'quantity', v)} placeholder="30000" /></div>
            <div className="icon-actions"><button title="Kopiraj proizvod" onClick={() => duplicateProduct(product)}>⧉</button><button title="Obriši proizvod" className="danger" onClick={() => removeProduct(product.id)}>×</button></div>
          </div>
          <Field label="Opis / specifikacija" value={product.description} onChange={v => updateProduct(product.id, 'description', v)} placeholder="Dimenzije, vrsta papira, dorada..." className="full-field" />

          <div className="cost-table-wrap">
            <table className="cost-table"><thead><tr><th>Trošak / materijal</th><th>Potrošnja</th><th>Jedinica</th><th>Nabavna cijena</th><th>Ukupno</th><th></th></tr></thead>
              <tbody>{[...product.items.map(i => ({...i, custom:false})), ...product.customItems.map(i => ({...i, custom:true}))].map(item => <tr key={item.id}>
                <td data-label="Trošak">{item.custom ? <input className="table-input name-input" value={item.name} onChange={e => updateItem(product.id, item.id, 'name', e.target.value, true)} /> : <strong>{item.name}</strong>}</td>
                <td data-label="Potrošnja"><input className="table-input" inputMode="decimal" value={item.quantity} onChange={e => updateItem(product.id, item.id, 'quantity', e.target.value, item.custom)} placeholder="0" /></td>
                <td data-label="Jedinica"><select value={item.unit} onChange={e => updateItem(product.id, item.id, 'unit', e.target.value, item.custom)}><option>arak</option><option>kg</option><option>l</option><option>m</option><option>rolna</option><option>kanister</option><option>kom</option><option>sat</option><option>usluga</option><option>km</option></select></td>
                <td data-label="Cijena"><div className="money-input"><input inputMode="decimal" value={item.price} onChange={e => updateItem(product.id, item.id, 'price', e.target.value, item.custom)} placeholder="0,00" /><span>KM</span></div></td>
                <td data-label="Ukupno" className="row-total">{money(parseNum(item.quantity) * parseNum(item.price))}</td>
                <td className="row-remove">{item.custom && <button title="Obriši trošak" className="row-x" onClick={() => removeCustomItem(product.id, item.id)}>×</button>}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <button className="text-btn" onClick={() => addCustomItem(product.id)}>＋ Dodaj vlastiti trošak</button>

          <div className="pricing-grid">
            <div className="waste-box"><Field label="Škart / rezerva (%)" value={product.wastePercent} onChange={v => updateProduct(product.id, 'wastePercent', v)} placeholder="npr. 5" /><p>Dodaje se na ukupni trošak ovog proizvoda.</p></div>
            <div className="pricing-box">
              <div className="mode-switch"><button className={product.pricingMode === 'margin' ? 'active' : ''} onClick={() => updateProduct(product.id, 'pricingMode', 'margin')}>Marža %</button><button className={product.pricingMode === 'manual' ? 'active' : ''} onClick={() => updateProduct(product.id, 'pricingMode', 'manual')}>Ručna cijena</button></div>
              {product.pricingMode === 'margin' ? <Field label="Željena marža (%)" value={product.margin} onChange={v => updateProduct(product.id, 'margin', v)} placeholder="20" /> : <Field label="Prodajna cijena po komadu (KM)" value={product.manualUnitPrice} onChange={v => updateProduct(product.id, 'manualUnitPrice', v)} placeholder="0,00" />}
            </div>
            <div className={`result-box ${totals.profit < 0 ? 'loss' : ''}`}>
              <div><span>Trošak ukupno</span><strong>{money(totals.cost)}</strong></div><div><span>Trošak / kom</span><strong>{money(totals.costUnit)}</strong></div><div><span>Prodajna cijena / kom</span><strong>{money(totals.saleUnit)}</strong></div><div><span>Prodajna cijena ukupno</span><strong>{money(totals.saleTotal)}</strong></div><div><span>Zarada ({number(totals.actualMargin, 1)}%)</span><strong>{money(totals.profit)}</strong></div>
              {totals.profit < 0 && <p className="loss-warning">⚠ Prodajna cijena je ispod troška!</p>}
            </div>
          </div>
        </section>
      })}

      <section className="card summary-card">
        <div><p className="eyebrow">ZAVRŠNI OBRAČUN</p><h2>Ukupno za ponudu</h2><p>Rabat se primjenjuje prije obračuna PDV-a.</p></div>
        <div className="summary-controls"><Field label="Rabat na cijelu ponudu (%)" value={offer.discount} onChange={v => updateOffer('discount', v)} placeholder="0" /><label className="toggle-row"><span><strong>PDV 17%</strong><small>Uključi porez u konačnu cijenu</small></span><input type="checkbox" checked={offer.vatEnabled} onChange={e => updateOffer('vatEnabled', e.target.checked)} /><i /></label></div>
        <div className="summary-lines"><div><span>Međuzbir</span><strong>{money(subtotal)}</strong></div><div><span>Rabat ({number(parseNum(offer.discount), 1)}%)</span><strong>− {money(discountAmount)}</strong></div><div><span>PDV {offer.vatEnabled ? '17%' : '(nije uključen)'}</span><strong>{money(vat)}</strong></div><div className="grand"><span>ZA PLAĆANJE</span><strong>{money(grandTotal)}</strong></div><div className={`internal-profit ${finalProfit < 0 ? 'negative' : ''}`}><span>Interna zarada nakon rabata</span><strong>{money(finalProfit)}</strong></div></div>
        <label className="field note-field"><span>Napomena na ponudi</span><textarea value={offer.note} onChange={e => updateOffer('note', e.target.value)} /></label>
        <div className="bottom-actions"><button className="btn ghost" onClick={addProduct}>＋ Dodaj još jedan proizvod</button><div><button className="btn dark large" disabled={saving} onClick={saveOffer}>{saving ? 'Čuvanje...' : editingId ? 'Ažuriraj ponudu' : 'Sačuvaj ponudu'}</button><button className="btn primary large" onClick={() => window.print()}>Štampaj / Sačuvaj kao PDF</button></div></div>
      </section>
      </>}
    </main>

    <section className="print-offer">
      <div className="print-header"><div className="print-brand"><img src={LOGO_URL} alt="Belim štamparija" /></div><div className="print-title"><span>PONUDA</span><strong>{offer.offerNumber || '—'}</strong></div></div>
      <div className="print-meta"><div><small>PONUDA ZA</small><strong>{offer.client || 'Klijent'}</strong><span>{offer.clientAddress}</span><span>{offer.contact}</span></div><div><p><small>Datum:</small> {offer.date || '—'}</p><p><small>Vrijedi:</small> {offer.validDays || 0} dana</p></div></div>
      <table className="print-table"><thead><tr><th>#</th><th>Opis proizvoda</th><th>Količina</th><th>Cijena / kom</th><th>Ukupno</th></tr></thead><tbody>{offer.products.map((p, index) => <tr key={p.id}><td>{index + 1}</td><td><strong>{p.name || 'Proizvod'}</strong>{p.description && <small>{p.description}</small>}</td><td>{number(productTotals[index].qty, 0)} kom</td><td>{money(productTotals[index].saleUnit)}</td><td>{money(productTotals[index].saleTotal)}</td></tr>)}</tbody></table>
      <div className="print-bottom"><div className="print-note"><small>NAPOMENA</small><p>{offer.note}</p></div><div className="print-totals"><div><span>Međuzbir</span><strong>{money(subtotal)}</strong></div>{discountAmount > 0 && <div><span>Rabat ({number(parseNum(offer.discount), 1)}%)</span><strong>− {money(discountAmount)}</strong></div>}<div><span>PDV {offer.vatEnabled ? '17%' : ''}</span><strong>{offer.vatEnabled ? money(vat) : 'Nije obračunat'}</strong></div><div className="print-grand"><span>ZA PLAĆANJE</span><strong>{money(grandTotal)}</strong></div></div></div>
      <footer className="print-footer"><span>Belim — štamparija</span><span>Hvala na povjerenju.</span></footer>
    </section>
  </div>
}

export default App
