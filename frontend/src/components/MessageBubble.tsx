export default function MessageBubble({role, content}:{role:'user'|'assistant'|'system', content:string}){
  return (
    <div className={`bubble ${role}`}>
      <div className="role">{role}</div>
      <div className="content">{content}</div>
    </div>
  )
}
