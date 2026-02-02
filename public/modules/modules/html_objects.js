const html_obj = {
  Invoice : `
    <main class="invoice" id="Invoice">
      <section class="pad">
        <header class="top">
          <h1 class="title">INVOICE</h1>

          <div class="meta" aria-label="Invoice metadata">
            <div class="label">Date</div>
            <p class="value">20/01/2026</p>

            <div class="label">Invoice No.</div>
            <p class="value">2000-15</p>
          </div>
        </header>

        <section class="parties" aria-label="Bill to and From">
          <div class="box">
            <p class="heading">Bill to:</p>
            <p class="name">Customer Name</p>
            <p class="line">customer@email.com</p>
            <p class="line">123 Any Street</p>
            <p class="line">Any City, ST 12345</p>
          </div>

          <div class="box">
            <p class="heading">From:</p>
            <p class="name">Your Company</p>
            <p class="line">accounts@yourcompany.com</p>
            <p class="line">123 Any Street</p>
            <p class="line">Any City, ST 12345</p>
          </div>
        </section>

        <section class="table-wrap" aria-label="Invoice line items">
          <table>
            <thead>
              <tr>
                <th class="desc">Description</th>
                <th class="num">Hours</th>
                <th class="num">Price</th>
                <th class="num">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="desc">Service or product description</td>
                <td class="num">2</td>
                <td class="num">£100.00</td>
                <td class="num">£200.00</td>
              </tr>
              <tr>
                <td class="desc">Service or product description</td>
                <td class="num">1</td>
                <td class="num">£700.00</td>
                <td class="num">£700.00</td>
              </tr>
              <tr>
                <td class="desc">Service or product description</td>
                <td class="num">1</td>
                <td class="num">£600.00</td>
                <td class="num">£600.00</td>
              </tr>
              <tr>
                <td class="desc">Service or product description</td>
                <td class="num">2</td>
                <td class="num">£300.00</td>
                <td class="num">£600.00</td>
              </tr>
            </tbody>
          </table>

          <div class="total" aria-label="Total amount">
            <span class="muted">Total amount</span>
            <span class="amount">£2,100.00</span>
          </div>
        </section>

        <section class="bottom" aria-label="Payment method and notes">
          <div class="pay">
            <p class="small-heading">Payment method</p>
            <p>Bank name: Example Bank</p>
            <p>Account No: 123-456-7890</p>
          </div>

          <div class="notes">
        </section>

      <section class="pay-cta">
        <button id="payWithBlinkBtn" class="pay-with-blink-btn">Pay with Blink</button>
      </section>

      <footer class="footer">
        <div class="site">www.example.com</div>
      </footer>
    </main>`
}

export default html_obj;