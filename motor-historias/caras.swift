// Encuentra las caras de una o varias fotos con Vision de macOS (local y sin costo).
// Devuelve un JSON por foto con cada cara en proporciones de la imagen ya derecha
// (0 a 1, origen arriba a la izquierda), de la frente al mentón. La más grande va primero.
//
// Compilar una vez:  swiftc -O caras.swift -o caras
// Usar:              ./caras foto1.jpg foto2.jpg ... > caras.json
// Sin Mac: el chequeo de caras se saltea y el resto del chequeo funciona igual.
import Foundation
import Vision
import CoreImage

func caras(_ ruta: String) -> [String: Any] {
    guard let ci = CIImage(contentsOf: URL(fileURLWithPath: ruta), options: [.applyOrientationProperty: true]) else {
        return ["foto": ruta, "error": "no se pudo abrir"]
    }
    let req = VNDetectFaceRectanglesRequest()
    let handler = VNImageRequestHandler(ciImage: ci, options: [:])
    do { try handler.perform([req]) } catch { return ["foto": ruta, "error": "\(error)"] }
    let ancho = ci.extent.width, alto = ci.extent.height
    var lista: [[String: Double]] = []
    for o in req.results ?? [] {
        let b = o.boundingBox  // origen abajo a la izquierda
        lista.append(["x": Double(b.minX), "y": Double(1 - b.maxY), "w": Double(b.width), "h": Double(b.height),
                      "confianza": Double(o.confidence)])
    }
    lista.sort { ($0["w"]! * $0["h"]!) > ($1["w"]! * $1["h"]!) }
    return ["foto": ruta, "ancho": Double(ancho), "alto": Double(alto), "caras": lista]
}

let rutas = Array(CommandLine.arguments.dropFirst())
guard !rutas.isEmpty else { print("uso: caras foto.jpg [foto2.jpg ...]"); exit(1) }
let datos = try JSONSerialization.data(withJSONObject: rutas.map(caras), options: [.prettyPrinted, .sortedKeys])
print(String(data: datos, encoding: .utf8)!)
