// Truyện của tôi: hiện ở trang chủ. Hai kiểu khai báo:
//  - Thư mục Google Drive, mỗi chương là một Google Docs: { folderId, title, description }.
//    folderId là đoạn sau drive.google.com/drive/folders/ trong link. Viết thêm tệp chương mới vào thư mục là web tự thấy.
//  - Một Google Docs chứa nhiều chương: { id, title, description }.
//    id là đoạn giữa docs.google.com/document/d/ và /edit trong link.
// Thư mục / tài liệu phải mở quyền "Bất kỳ ai có đường liên kết đều xem được".
const MY_STORIES = [
  {
    folderId: '1RG0VaKDApKgUY5oPHPb4NwAoxIOCKk_G',
    title: 'Tẫn Mệnh Giản',
    description: 'Truyện sáng tác — cập nhật từ Google Drive',
  },
];

export default MY_STORIES;
