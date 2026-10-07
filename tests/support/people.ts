// The fixed people list of the server-flow specs: 200 rows the fake server
// of the playground (apps/playground/scenarios/fake-server.ts) filters,
// sorts and pages. The specs own this data, so the dataset the playground
// shows can change without touching them. Every call returns a fresh array
// with the same content.

const names = [
  'Charlie',
  'Alice',
  'Bob',
  'Dave',
  'Eve',
  'Frank',
  'Grace',
  'Heidi',
  'Ivan',
  'Judy',
  'Mallory',
  'Niaj',
  'Olivia',
  'Peggy',
  'Rupert'
]
const cities = ['Ankara', 'İstanbul', 'İzmir', 'Bursa', 'Antalya']

export const createPeople = () =>
  Array.from({ length: 200 }, (_, i) => ({
    id: i + 1,
    name: names[i % names.length],
    city: cities[i % cities.length],
    age: 22 + ((i * 7) % 30),
    salary: 42000 + ((i * 3517) % 40000),
    joined: `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
    active: i % 3 !== 0
  }))

/** The fields a global search over people matches. */
export const peopleSearchFields = ['name', 'city']
