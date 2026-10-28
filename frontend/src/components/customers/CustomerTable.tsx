import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Customer } from '@/lib/api/types'

export function CustomerTable({ customers }: { customers: Customer[] }) {
  return (
    <Table>
      <TableCaption className="sr-only">Customers</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>GSTIN</TableHead>
          <TableHead>State code</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((customer) => (
          <TableRow key={customer.id}>
            <TableCell className="font-medium">{customer.name}</TableCell>
            <TableCell className="font-mono text-xs">{customer.gstin ?? '—'}</TableCell>
            <TableCell>{customer.stateCode ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
