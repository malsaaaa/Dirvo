import { SHORTCUT_GROUPS } from '../lib/shortcuts'
import Button from './Button'
import Kbd from './Kbd'
import Modal from './Modal'

/** The keyboard cheat sheet. Opened with ? or from the sidebar. */
export default function ShortcutsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <Modal titleId="shortcuts-title" onClose={onClose}>
      <h2 id="shortcuts-title" className="text-xl font-medium">
        Keyboard shortcuts
      </h2>
      <p className="mt-1 text-sm text-ink-2">Letter keys work when you are not typing in a box.</p>

      <div className="mt-5 flex flex-col gap-5">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3 className="text-sm font-medium text-ink-2">{group.title}</h3>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {group.items.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="text-sm">{s.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {s.keys.map((k, i) => (
                      <Kbd key={`${k}-${i}`}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}
