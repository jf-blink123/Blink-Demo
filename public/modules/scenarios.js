// modules/scenarios.js
export const SCENARIOS = [
  {
    id: "paylink",
    title: "Paylink",
    description: "Generate a paylink and embed it into an invoice flow.",
    tags: ["Invoice", "Build Invoice", "Payment Links"],
  },
  {
    id: "virtual_terminal",
    title: "Virtual Terminal",
    description: "Take a card-not-present payment via Blink Hosted Fields.",
    tags: [], // none
  },

  // ✅ NEW: Repeat / Recurring Payments scenario
  {
    id: "recurring",
    title: "Repeat Payments",
    description: "Create and manage recurring / repeat payments (demo UI).",
    tags: ["Create Plan", "Customers", "Schedules"],
    views: {
      "Create Plan": {
        description: "Define a repeat payment plan (amount, frequency, start date).",
        fields: [
          { id: "customer_name", label: "Customer Name", type: "text", placeholder: "customer_name" },
          { id: "customer_email", label: "Customer Email", type: "email", placeholder: "customer_email" },
          { id: "customer_phone", label: "Customer Phone", type: "text", placeholder: "customer_phone" },

          { id: "amount", label: "Amount (minor units)", type: "number", placeholder: "amount" },
          { id: "currency", label: "Currency", type: "text", placeholder: "currency" },

          {
            id: "frequency",
            label: "Frequency",
            type: "select",
            placeholder: "frequency",
            options: [
              { label: "weekly", value: "weekly" },
              { label: "monthly", value: "monthly" },
              { label: "quarterly", value: "quarterly" },
            ],
          },

          { id: "interval_count", label: "Interval Count", type: "number", placeholder: "interval_count" },
          { id: "start_date", label: "Start Date", type: "date", placeholder: "start_date" },
          { id: "end_date", label: "End Date (optional)", type: "date", placeholder: "end_date" },

          { id: "reference", label: "Reference", type: "text", placeholder: "reference" },
          { id: "notes", label: "Notes", type: "textarea", placeholder: "notes" },
        ],
      },
      Customers: {
        description: "List customers with active repeat payments (demo view).",
        fields: [
          { id: "search", label: "Search", type: "text", placeholder: "search" },
          { id: "status", label: "Status", type: "select", placeholder: "status", options: [
            { label: "all", value: "all" },
            { label: "active", value: "active" },
            { label: "paused", value: "paused" },
            { label: "cancelled", value: "cancelled" },
          ]},
        ],
      },
      Schedules: {
        description: "View upcoming scheduled charges (demo view).",
        fields: [
          { id: "from_date", label: "From Date", type: "date", placeholder: "from_date" },
          { id: "to_date", label: "To Date", type: "date", placeholder: "to_date" },
        ],
      },
    },
  },

  {
    id: "ecom",
    title: "E-Commerce",
    description: "E-Commerce Checkout flow",
    tags: ["Products", "Checkout"],
    views: {
      Products: {
        description: "Products view: choose products, show catalog, or return products from DB.",
        fields: [
          { id: "query", label: "Search Query", type: "text", placeholder: "e.g. boxes" },
          { id: "limit", label: "Limit", type: "number", placeholder: "e.g. 8", defaultValue: "8" },
        ],
      },
      Checkout: {
        description: "Checkout flow: create session, return URL, line items, etc.",
        fields: [
          { id: "amount", label: "Amount (minor units)", type: "number", placeholder: "e.g. 2599", required: true },
          { id: "currency", label: "Currency", type: "text", placeholder: "GBP", defaultValue: "GBP" },
          { id: "orderId", label: "Order ID", type: "text", placeholder: "ORDER-30001", required: true },
          { id: "returnUrl", label: "Return URL", type: "url", placeholder: "https://example.com/return" },
          { id: "items", label: "Items (JSON)", type: "textarea", placeholder: `[{"sku":"BOX-S","qty":2,"price":999}]` },
        ],
      },
    },
  },
];
