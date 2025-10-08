export default function ChatLayout({threads, onNewThread, onSelectThread, currentThreadId, children}: any){
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="side-header">
          <h3>Conversas</h3>
          <button onClick={onNewThread}>+ Nova</button>
        </div>
        <ul>
          {threads.map((t:any)=> (
            <li key={t.id} className={t.id===currentThreadId? 'active':''} onClick={()=>onSelectThread(t.id)}>
              {t.title || `Thread #${t.id}`}
            </li>
          ))}
        </ul>
      </aside>
      <main className="chat">
        {children}
      </main>
    </div>
  )
}
