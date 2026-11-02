import { useParams } from 'react-router'
import RowsTable from '../../components/RowsTable'
import UploadPanel from '../../components/UploadPanel'

export default function DataStep() {
  const { projectId = '' } = useParams()
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Upload data</h2>
        <UploadPanel projectId={projectId} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Rows</h2>
        <RowsTable projectId={projectId} />
      </section>
    </div>
  )
}
