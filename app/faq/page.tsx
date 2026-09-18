import Link from 'next/link'
import { ArrowLeft, ChevronDown, HelpCircle } from 'lucide-react'

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Who can sign in?',
    a: 'Only emails on the Admin list in Settings. Microsoft sign-in is not enough by itself.',
  },
  {
    q: 'What does Sync Onboarding/Offboarding actually do?',
    a: 'On Devices it reads the SharePoint onboarding and offboarding workbooks, matches Ninja PCs, and shows review cards for you to confirm (new hires, terms, new or unassigned devices, and Azure title, office, or department). If a hire is missing, Add Employee on the Employees page.',
  },
  {
    q: 'What happens when someone is offboarded?',
    a: 'They are removed from EMS. Assigned devices, including loaners, are unassigned and set to In Stock. You can also Offboard from their employee record; that cannot be undone.',
  },
  {
    q: 'What is the difference between Devices and Stock?',
    a: 'Devices is who has which laptop, desktop, monitor, TV, printer, or server. Stock is closet inventory: purchase lots and remaining quantity.',
  },
  {
    q: 'What happens if I assign a device that is already assigned?',
    a: 'The previous person is unassigned and the device moves to the new person. Assignment history keeps both. The office is not charged again. You cannot assign a device to the person who already has it.',
  },
  {
    q: 'How do loaner devices work?',
    a: 'Loaner is a checkbox, not a status. Check it out with a due date (defaults to 14 days). Overdue loaners show in red. Returning or reassigning closes that checkout; the loaner flag stays. Loaners are not charged on the stock report.',
  },
  {
    q: 'When does an office get charged for stock?',
    a: 'The first time a stock item is assigned to a person. That row is what accounting uses to correctly charge the office.',
  },
  {
    q: 'Which lot gets used when I assign a PC?',
    a: 'FIFO by make and model is the default. You can pick any open lot instead.',
  },
  {
    q: 'Which lot should I pick if the same make/model has more than one price?',
    a: 'Pick the lot that matches the unit that actually went to that office or person — the correct purchase cost — not just the oldest lot.',
  },
  {
    q: 'What does Charge to mean?',
    a: 'The office that should be billed on the stock report. Florida groups Orlando and Sarasota. Remote is not a charge office.',
  },
  {
    q: 'What does “Not from stock” mean?',
    a: 'A one-time buy or a device that was already owned. It does not consume a lot and does not show on the stock report.',
  },
  {
    q: 'Who gets the stock-history email?',
    a: 'ap@bennett-pless.com at month end. Accounting does not sign in. In-app reports are Stock Tracker → Reports.',
  },
  {
    q: 'Where is the audit log?',
    a: 'Settings → Admin Tools → Audit log.',
  },
]

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-indigo-100 rounded-lg p-2">
            <HelpCircle className="w-6 h-6 text-indigo-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900">FAQ</h1>
        </div>
        <p className="text-gray-600 mb-8">
          Common questions about employees, devices, stock, and who can use this site.
        </p>
        <div className="space-y-3">
          {FAQS.map((item) => (
            <details
              key={item.q}
              className="group bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4"
            >
              <summary className="cursor-pointer list-none font-semibold text-gray-900 flex items-start justify-between gap-3">
                <span>{item.q}</span>
                <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-gray-600 text-sm leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
