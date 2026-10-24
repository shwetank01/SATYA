package app.satya.sakshi

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

/** SAKSHI (Section 8.4): the phone's own record. Nothing in here is uploaded. */
@Entity(tableName = "checks", indices = [Index("ts")])
data class CheckEntity(
    @PrimaryKey val id: String,
    val ts: Long,
    val trigger: String,
    val channel: String,
    val sourcePkg: String?,
    val claimedBank: String?,
    val severity: String,
    val ruleIds: String,
    val verdict: String,
    val receiptJson: String,
)

/** Every byte that left the phone (Law 2): written by KavachClient on each send. */
@Entity(tableName = "egress", indices = [Index("ts")])
data class EgressEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val ts: Long,
    val checkId: String?,
    val protocol: String,
    val destination: String,
    val packetType: String,
    val bytes: Long,
    /** Plain words, e.g. "Sent 5 characters of a fingerprint to SANGH." */
    val summary: String,
    /** Exactly what was sent, already masked (design: Privacy Log payload box). */
    val payload: String,
    /** check | report | app | sync | doctor */
    val category: String,
    val ok: Boolean = true,
)

@Entity(tableName = "reports", indices = [Index("checkId")])
data class ReportEntity(
    @PrimaryKey(autoGenerate = true) val localId: Long = 0,
    val checkId: String,
    val reportId: String? = null,
    /** Secret, local only. The server only ever sees sha256(ticket). */
    val ticket: String,
    val bankId: String,
    /** queued | delivered | opened | blocked | dismissed | failed */
    val status: String,
    val receiptSig: String? = null,
    val sealedHash: String? = null,
    val sealedBytes: Int = 0,
    val envelopeJson: String? = null,
    val callback: Boolean = false,
    val payee: String = "",
    val createdAt: Long,
    val updatedAt: Long,
    /** JSON map status -> epoch ms, drives the 5-step timeline. */
    val timesJson: String = "{}",
    val number: String = "",
)

@Entity(tableName = "watchlist")
data class WatchEntity(@PrimaryKey val pkg: String, val label: String, val reason: String, val bank: String?, val addedAt: Long)

@Dao
interface ChecksDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun put(c: CheckEntity)
    @Query("SELECT * FROM checks ORDER BY ts DESC") fun all(): Flow<List<CheckEntity>>
    @Query("SELECT * FROM checks WHERE id = :id") suspend fun get(id: String): CheckEntity?
    @Query("SELECT * FROM checks WHERE id = :id") fun watch(id: String): Flow<CheckEntity?>
    @Query("DELETE FROM checks WHERE id = :id") suspend fun delete(id: String)
    @Query("SELECT COUNT(*) FROM checks") suspend fun count(): Int
    @Query("DELETE FROM checks") suspend fun clear()
}

@Dao
interface EgressDao {
    @Insert suspend fun put(e: EgressEntity): Long
    @Query("SELECT * FROM egress ORDER BY ts DESC") fun all(): Flow<List<EgressEntity>>
    @Query("SELECT * FROM egress WHERE checkId = :checkId ORDER BY ts") suspend fun forCheck(checkId: String): List<EgressEntity>
    @Query("SELECT COUNT(*) FROM egress WHERE ts >= :since") fun countSince(since: Long): Flow<Int>
    @Query("DELETE FROM egress") suspend fun clear()
}

@Dao
interface ReportsDao {
    @Insert suspend fun put(r: ReportEntity): Long
    @Update suspend fun update(r: ReportEntity)
    @Query("SELECT * FROM reports ORDER BY createdAt DESC") fun all(): Flow<List<ReportEntity>>
    @Query("SELECT * FROM reports WHERE localId = :id") suspend fun get(id: Long): ReportEntity?
    @Query("SELECT * FROM reports WHERE localId = :id") fun watch(id: Long): Flow<ReportEntity?>
    @Query("SELECT * FROM reports WHERE status IN ('delivered','opened') AND reportId IS NOT NULL") suspend fun open(): List<ReportEntity>
    @Query("SELECT * FROM reports WHERE status = 'queued'") suspend fun queued(): List<ReportEntity>
    @Query("DELETE FROM reports") suspend fun clear()
}

@Dao
interface WatchDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun put(w: WatchEntity)
    @Query("SELECT * FROM watchlist ORDER BY addedAt DESC") fun all(): Flow<List<WatchEntity>>
    @Query("SELECT * FROM watchlist") suspend fun list(): List<WatchEntity>
    @Query("DELETE FROM watchlist WHERE pkg = :pkg") suspend fun remove(pkg: String)
}

@Database(entities = [CheckEntity::class, EgressEntity::class, ReportEntity::class, WatchEntity::class], version = 1, exportSchema = true)
abstract class SakshiDb : RoomDatabase() {
    abstract fun checks(): ChecksDao
    abstract fun egress(): EgressDao
    abstract fun reports(): ReportsDao
    abstract fun watch(): WatchDao

    companion object {
        fun open(ctx: Context): SakshiDb = Room.databaseBuilder(ctx, SakshiDb::class.java, "sakshi.db").fallbackToDestructiveMigration(true).build()
    }
}
