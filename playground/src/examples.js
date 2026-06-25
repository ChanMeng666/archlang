export const EXAMPLES = {
  "Studio (1BR)": `plan "Studio 1BR" {
  units mm
  grid 50
  scale 1:50
  north up

  wall exterior thickness 200 { (0,0) (7000,0) (7000,6000) (0,6000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }
  wall partition thickness 100 { (4000,4000) (7000,4000) }

  room id=r_living at (0,0)    size 4000x6000 label "Living / Kitchen"
  room id=r_bed    at (4000,0) size 3000x4000 label "Bedroom"
  room id=r_bath   at (4000,4000) size 3000x2000 label "Bath"

  door id=d_main at (1000,6000) width 1000 wall exterior  hinge left  swing in
  door id=d_bed  at (4000,1500) width 900  wall partition hinge left  swing in
  door id=d_bath at (5200,4000) width 800  wall partition hinge right swing out

  window at (2500,0)    width 1800 wall exterior
  window at (7000,2000) width 1200 wall exterior

  furniture bed   at (4300,300) size 1500x2000 label "Bed"
  furniture sofa  at (300,4200) size 2000x900  label "Sofa"

  dim (0,6000)->(7000,6000) offset 600 text "7000"
  dim (7000,0)->(7000,6000) offset 600 text "6000"

  title { project "Studio Apartment" drawn_by "ArchLang" date "2026" }
}`,
  "Single room": `plan "One Room" {
  units mm
  grid 100
  wall exterior thickness 150 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r at (0,0) size 5000x4000 label "Studio"
  door at (2500,4000) width 900 wall exterior hinge left swing in
  window at (0,2000) width 1500 wall exterior
}`,
  "Parametric (let + component)": `plan "Studio Row" {
  units mm
  grid 50
  scale 1:100

  let WALL = 200
  let W = 4000
  let H = 5000

  component unit(x) {
    wall exterior thickness WALL { (x,0) (x+W,0) (x+W,H) (x,H) close }
    room at (x,0) size W x H label "Studio"
    furniture bed at (x+300,300) size 1500x2000 label "Bed"
    door at (x + W/2, H) width 900 wall exterior hinge left swing in
    window at (x + W/2, 0) width 1600 wall exterior
  }

  unit(0)
  unit(W)
  unit(W * 2)

  dim (0,0)->(W*3,0) offset 700 text "3 units"
}`,
};
