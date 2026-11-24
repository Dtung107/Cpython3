package com.example.filemanager.extensions.network

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

@JsonClass(generateAdapter = true)
data class GitHubUserDto(
    @Json(name = "login") val login: String = "",
    @Json(name = "name") val name: String? = null,
    @Json(name = "avatar_url") val avatarUrl: String? = null
)

@JsonClass(generateAdapter = true)
data class CreateRepoRequestDto(
    @Json(name = "name") val name: String,
    @Json(name = "private") val isPrivate: Boolean = false,
    @Json(name = "auto_init") val autoInit: Boolean = true,
    @Json(name = "description") val description: String = "Android project pushed by File Manager Pro for automated APK CI/CD"
)

@JsonClass(generateAdapter = true)
data class GitHubRepoDto(
    @Json(name = "name") val name: String = "",
    @Json(name = "full_name") val fullName: String = "",
    @Json(name = "html_url") val htmlUrl: String = "",
    @Json(name = "default_branch") val defaultBranch: String? = null,
    @Json(name = "private") val isPrivate: Boolean = false
)

@JsonClass(generateAdapter = true)
data class GitRefObjectDto(
    @Json(name = "sha") val sha: String = ""
)

@JsonClass(generateAdapter = true)
data class GitRefResponseDto(
    @Json(name = "ref") val ref: String = "",
    @Json(name = "object") val obj: GitRefObjectDto? = null
)

@JsonClass(generateAdapter = true)
data class PutFileContentRequestDto(
    @Json(name = "message") val message: String,
    @Json(name = "content") val base64Content: String,
    @Json(name = "branch") val branch: String
)

@JsonClass(generateAdapter = true)
data class PutFileCommitDto(
    @Json(name = "sha") val sha: String = ""
)

@JsonClass(generateAdapter = true)
data class PutFileContentResponseDto(
    @Json(name = "commit") val commit: PutFileCommitDto? = null
)

@JsonClass(generateAdapter = true)
data class CreateBlobRequestDto(
    @Json(name = "content") val base64Content: String,
    @Json(name = "encoding") val encoding: String = "base64"
)

@JsonClass(generateAdapter = true)
data class ShaResponseDto(
    @Json(name = "sha") val sha: String = ""
)

@JsonClass(generateAdapter = true)
data class GitTreeEntryDto(
    @Json(name = "path") val path: String,
    @Json(name = "mode") val mode: String,
    @Json(name = "type") val type: String = "blob",
    @Json(name = "sha") val sha: String
)

@JsonClass(generateAdapter = true)
data class CreateTreeRequestDto(
    @Json(name = "tree") val tree: List<GitTreeEntryDto>,
    @Json(name = "base_tree") val baseTree: String? = null
)

@JsonClass(generateAdapter = true)
data class CreateCommitRequestDto(
    @Json(name = "message") val message: String,
    @Json(name = "tree") val tree: String,
    @Json(name = "parents") val parents: List<String> = emptyList()
)

@JsonClass(generateAdapter = true)
data class UpdateRefRequestDto(
    @Json(name = "sha") val sha: String,
    @Json(name = "force") val force: Boolean = true
)

@JsonClass(generateAdapter = true)
data class WorkflowDispatchRequestDto(
    @Json(name = "ref") val ref: String,
    @Json(name = "inputs") val inputs: Map<String, String> = emptyMap()
)

@JsonClass(generateAdapter = true)
data class WorkflowRunDto(
    @Json(name = "id") val id: Long = 0L,
    @Json(name = "name") val name: String? = null,
    @Json(name = "status") val status: String? = null,
    @Json(name = "conclusion") val conclusion: String? = null,
    @Json(name = "html_url") val htmlUrl: String = ""
)

@JsonClass(generateAdapter = true)
data class WorkflowRunsResponseDto(
    @Json(name = "total_count") val totalCount: Int = 0,
    @Json(name = "workflow_runs") val workflowRuns: List<WorkflowRunDto> = emptyList()
)

/**
 * Retrofit REST interface for GitHub integration:
 * - User token verification
 * - Repository lookup and creation
 * - Git tree / blob / commit / ref code push
 * - GitHub Actions APK workflow dispatch and status lookup
 */
interface GitHubApiService {

    @GET("user")
    suspend fun getAuthenticatedUser(
        @Header("Authorization") authorization: String
    ): Response<GitHubUserDto>

    @GET("repos/{owner}/{repo}")
    suspend fun getRepository(
        @Header("Authorization") authorization: String,
        @Path("owner") owner: String,
        @Path("repo") repo: String
    ): Response<GitHubRepoDto>

    @POST("user/repos")
    suspend fun createRepository(
        @Header("Authorization") authorization: String,
        @Body request: CreateRepoRequestDto
    ): Response<GitHubRepoDto>

    @GET("repos/{owner}/{repo}/git/ref/heads/{branch}")
    suspend fun getBranchRef(
        @Header("Authorization") authorization: String,
        @Path("owner") owner: String,
        @Path("repo") repo: String,
        @Path("branch") branch: String
    ): Response<GitRefResponseDto>

    @PUT("repos/{owner}/{repo}/contents/{path}")
    suspend fun putFileContent(
        @Header("Authorization") authorization: String,
        @Path("owner") owner: String,
        @Path("repo") repo: String,
        @Path("path", encoded = true) path: String,
        @Body request: PutFileContentRequestDto
    ): Response<PutFileContentResponseDto>

    @POST("repos/{owner}/{repo}/git/blobs")
    suspend fun createBlob(
        @Header("Authorization") authorization: String,
        @Path("owner") owner: String,
        @Path("repo") repo: String,
        @Body request: CreateBlobRequestDto
    ): Response<ShaResponseDto>

    @POST("repos/{owner}/{repo}/git/trees")
    suspend fun createTree(
        @Header("Authorization") authorization: String,
        @Path("owner") owner: String,
        @Path("repo") repo: String,
        @Body request: CreateTreeRequestDto
    ): Response<ShaResponseDto>

    @POST("repos/{owner}/{repo}/git/commits")
    suspend fun createCommit(
        @Header("Authorization") authorization: String,
        @Path("owner") owner: String,
        @Path("repo") repo: String,
        @Body request: CreateCommitRequestDto
    ): Response<ShaResponseDto>

    @PATCH("repos/{owner}/{repo}/git/refs/heads/{branch}")
    suspend fun updateBranchRef(
        @Header("Authorization") authorization: String,
        @Path("owner") owner: String,
        @Path("repo") repo: String,
        @Path("branch") branch: String,
        @Body request: UpdateRefRequestDto
    ): Response<GitRefResponseDto>

    @POST("repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches")
    suspend fun dispatchWorkflow(
        @Header("Authorization") authorization: String,
        @Path("owner") owner: String,
        @Path("repo") repo: String,
        @Path("workflow_id") workflowId: String,
        @Body request: WorkflowDispatchRequestDto
    ): Response<Unit>

    @GET("repos/{owner}/{repo}/actions/runs")
    suspend fun listWorkflowRuns(
        @Header("Authorization") authorization: String,
        @Path("owner") owner: String,
        @Path("repo") repo: String,
        @Query("per_page") perPage: Int = 5
    ): Response<WorkflowRunsResponseDto>
}

object GitHubApiServiceFactory {

    const val DEFAULT_BASE_URL = "https://api.github.com/"

    fun create(
        baseClient: OkHttpClient = defaultOkHttpClient(),
        baseUrl: String = DEFAULT_BASE_URL
    ): GitHubApiService {
        val normalizedUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        val configuredClient = baseClient.newBuilder()
            .addInterceptor(githubHeadersInterceptor())
            .build()

        val moshi = Moshi.Builder()
            .addLast(KotlinJsonAdapterFactory())
            .build()

        return Retrofit.Builder()
            .baseUrl(normalizedUrl)
            .client(configuredClient)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(GitHubApiService::class.java)
    }

    private fun githubHeadersInterceptor() = Interceptor { chain ->
        val updated = chain.request().newBuilder()
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "FileManagerPro-Android/1.0")
            .build()
        chain.proceed(updated)
    }

    fun defaultOkHttpClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(25, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .build()
}
