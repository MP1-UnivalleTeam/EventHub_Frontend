import { useState } from "react"

function App() {
  const [name, setName] = useState("hola");
  return (
    <div>
      <p>{name}</p>
      <button> onClick={() => setName("mundo")}Cambiar</button>
      </div>
  )

}

export default App
